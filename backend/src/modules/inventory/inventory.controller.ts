import { Router, Request, Response, NextFunction } from 'express';
import { inventoryService } from './inventory.service';
import { createProductSchema, updateProductSchema, movementSchema } from './inventory.validators';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import { getProductByBarcode } from './cosmos.service';
import { supplierService } from '../suppliers/supplier.service';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);
inventoryRouter.use(requireTenant);

// Cosmos-only lookup — never exposes token, always queries external API
inventoryRouter.get('/cosmos/:codigo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.params.codigo as string;
    const cosmos = await getProductByBarcode(code);
    if (!cosmos || !cosmos.description) {
      return success(res, { found: false });
    }
    return success(res, {
      found: true,
      nome: cosmos.description,
      marca: cosmos.brand,
      preco: cosmos.avgPrice,
      fornecedor: cosmos.brand,
      thumbnail: cosmos.thumbnail,
      category: cosmos.category,
    });
  } catch (err) {
    next(err);
  }
});

// Barcode lookup — local DB first, then Cosmos API
inventoryRouter.get('/barcode/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.params.code as string;
    const tenantId = req.auth!.tenantId!;

    // Search local DB by SKU
    const { products } = await inventoryService.listProducts(tenantId, {
      skip: 0, take: 5, search: code,
    });
    const local = products.find((p: any) => p.sku === code);

    if (local) {
      return success(res, { found: true, source: 'local', product: local });
    }

    // Not found locally — try Cosmos API
    const cosmos = await getProductByBarcode(code);

    if (cosmos && cosmos.description) {
      return success(res, {
        found: false,
        source: 'cosmos',
        product: {
          description: cosmos.description,
          brand: cosmos.brand,
          category: cosmos.category,
          thumbnail: cosmos.thumbnail,
          avgPrice: cosmos.avgPrice,
        },
      });
    }

    return success(res, { found: false, source: null, product: null });
  } catch (err) {
    next(err);
  }
});

// Produtos
inventoryRouter.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const lowStock = req.query.lowStock === 'true';

    const { products, total } = await inventoryService.listProducts(
      req.auth!.tenantId!,
      { skip, take: limit, search, category, lowStock },
    );

    return success(res, products, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await inventoryService.getProductById(req.auth!.tenantId!, req.params.id as string);
    return success(res, product);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[ESTOQUE] POST body:', JSON.stringify(req.body, null, 2));
    const data = createProductSchema.parse(req.body);
    const product = await inventoryService.createProduct(req.auth!.tenantId!, data);

    await createAuditLog({
      req,
      action: 'product.create',
      entity: 'Product',
      entityId: product.id,
    });

    return created(res, product);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.put('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[ESTOQUE] PUT body:', JSON.stringify(req.body, null, 2));
    const data = updateProductSchema.parse(req.body);
    const product = await inventoryService.updateProduct(req.auth!.tenantId!, req.params.id as string, data);

    await createAuditLog({
      req,
      action: 'product.update',
      entity: 'Product',
      entityId: product.id,
    });

    return success(res, product);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await inventoryService.deleteProduct(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'product.delete',
      entity: 'Product',
      entityId: req.params.id as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Suppliers linked to a product
inventoryRouter.get('/products/:id/suppliers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await supplierService.getSuppliersByProduct(req.auth!.tenantId!, req.params.id as string);
    return success(res, suppliers);
  } catch (err) {
    next(err);
  }
});

// Movimentações
inventoryRouter.post('/products/:id/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = movementSchema.parse(req.body);
    const movement = await inventoryService.createMovement(
      req.auth!.tenantId!,
      req.params.id as string,
      data,
      req.auth!.userId,
    );

    await createAuditLog({
      req,
      action: `inventory.${data.type.toLowerCase()}`,
      entity: 'InventoryMovement',
      entityId: movement.id,
    });

    return created(res, movement);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/products/:id/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { movements, total } = await inventoryService.listMovements(
      req.auth!.tenantId!,
      req.params.id as string,
      skip,
      limit,
    );
    return success(res, movements, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

// Categorias
inventoryRouter.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await inventoryService.listCategories(req.auth!.tenantId!);
    return success(res, categories);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await inventoryService.createCategory(req.auth!.tenantId!, req.body.name);
    return created(res, category);
  } catch (err) {
    next(err);
  }
});

// Alertas de estoque baixo
inventoryRouter.get('/alerts/low-stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await inventoryService.getLowStockProducts(req.auth!.tenantId!);
    return success(res, products);
  } catch (err) {
    next(err);
  }
});

// Trigger low stock email check for a product (debug/test)
inventoryRouter.post('/alerts/test-email/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const productId = req.params.productId as string;
    const result = await inventoryService.testLowStockEmail(tenantId, productId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// Alertas de produtos próximos do vencimento
inventoryRouter.get('/alerts/expiring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Number(req.query.days) || 30;
    const products = await inventoryService.getExpiringProducts(req.auth!.tenantId!, days);
    return success(res, products);
  } catch (err) {
    next(err);
  }
});
