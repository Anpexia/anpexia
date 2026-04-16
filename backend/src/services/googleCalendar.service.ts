import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/database';

console.log('[GOOGLE-CAL] ENV check:', {
  clientId: !!process.env.GOOGLE_CLIENT_ID,
  clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function saveTokens(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  // Upsert single row — delete all then create
  await prisma.googleCalendarToken.deleteMany();
  await prisma.googleCalendarToken.create({
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: BigInt(tokens.expiry_date || 0),
    },
  });
  console.log('[GOOGLE-CAL] Tokens saved successfully');
}

export async function getCalendarClient() {
  const token = await prisma.googleCalendarToken.findFirst();
  if (!token) {
    throw new Error('Google Calendar not connected. Please connect via /api/google/auth');
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: Number(token.expiryDate),
  });

  // Handle token refresh
  client.on('tokens', async (newTokens) => {
    try {
      const updateData: any = {};
      if (newTokens.access_token) updateData.accessToken = newTokens.access_token;
      if (newTokens.expiry_date) updateData.expiryDate = BigInt(newTokens.expiry_date);
      if (newTokens.refresh_token) updateData.refreshToken = newTokens.refresh_token;
      await prisma.googleCalendarToken.update({ where: { id: token.id }, data: updateData });
      console.log('[GOOGLE-CAL] Tokens refreshed and saved');
    } catch (err) {
      console.error('[GOOGLE-CAL] Failed to save refreshed tokens:', err);
    }
  });

  return google.calendar({ version: 'v3', auth: client });
}

export async function createCalendarEvent(params: {
  title: string;
  description?: string;
  dueAt: Date;
}): Promise<string | null> {
  try {
    const calendar = await getCalendarClient();
    const startTime = new Date(params.dueAt);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30min duration

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: params.title,
        description: params.description || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 },
          ],
        },
      },
    });

    console.log('[GOOGLE-CAL] Event created:', event.data.id);
    return event.data.id || null;
  } catch (err: any) {
    console.error('[GOOGLE-CAL] Failed to create event:', err.message);
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  try {
    const calendar = await getCalendarClient();
    await calendar.events.delete({ calendarId: 'primary', eventId });
    console.log('[GOOGLE-CAL] Event deleted:', eventId);
  } catch (err: any) {
    console.error('[GOOGLE-CAL] Failed to delete event:', err.message);
  }
}

export async function listUpcomingEvents() {
  const calendar = await getCalendarClient();
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export async function isConnected(): Promise<boolean> {
  const token = await prisma.googleCalendarToken.findFirst();
  return !!token;
}

export async function disconnect(): Promise<void> {
  await prisma.googleCalendarToken.deleteMany();
  console.log('[GOOGLE-CAL] Disconnected');
}
