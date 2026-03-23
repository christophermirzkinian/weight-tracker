import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ROOMS = process.env.ROOMS_TABLE;
const ENTRIES = process.env.ENTRIES_TABLE;

function res(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Room-Id,X-Username',
    },
    body: JSON.stringify(body),
  };
}

function roomCode() {
  // 6-char alphanumeric room code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function createRoom(body) {
  const { name, username } = body;
  if (!name || !username) return res(400, { error: 'name and username required' });

  const roomId = roomCode();
  const now = new Date().toISOString();

  await client.send(new PutCommand({
    TableName: ROOMS,
    Item: {
      roomId,
      name,
      createdBy: username,
      createdAt: now,
      members: [username],
    },
  }));

  return res(201, { roomId, name, members: [username] });
}

async function getRoom(roomId) {
  const { Item } = await client.send(new GetCommand({
    TableName: ROOMS,
    Key: { roomId },
  }));
  if (!Item) return res(404, { error: 'Room not found' });
  return res(200, Item);
}

async function joinRoom(roomId, body) {
  const { username } = body;
  if (!username) return res(400, { error: 'username required' });

  // Verify room exists
  const { Item } = await client.send(new GetCommand({
    TableName: ROOMS,
    Key: { roomId },
  }));
  if (!Item) return res(404, { error: 'Room not found' });

  if (Item.members.includes(username)) {
    return res(200, { message: 'Already a member', ...Item });
  }

  // Add member
  await client.send(new UpdateCommand({
    TableName: ROOMS,
    Key: { roomId },
    UpdateExpression: 'SET members = list_append(members, :u)',
    ExpressionAttributeValues: { ':u': [username] },
  }));

  Item.members.push(username);
  return res(200, Item);
}

async function logEntry(roomId, body) {
  const { username, date, weight } = body;
  if (!username || !date || weight == null) {
    return res(400, { error: 'username, date, and weight required' });
  }

  // Verify membership
  const { Item: room } = await client.send(new GetCommand({
    TableName: ROOMS,
    Key: { roomId },
  }));
  if (!room) return res(404, { error: 'Room not found' });
  if (!room.members.includes(username)) return res(403, { error: 'Not a member of this room' });

  const userDate = `${username}#${date}`;
  await client.send(new PutCommand({
    TableName: ENTRIES,
    Item: { roomId, userDate, username, date, weight: Number(weight) },
  }));

  return res(201, { roomId, username, date, weight: Number(weight) });
}

async function getRoomEntries(roomId) {
  const { Items } = await client.send(new QueryCommand({
    TableName: ENTRIES,
    KeyConditionExpression: 'roomId = :r',
    ExpressionAttributeValues: { ':r': roomId },
  }));
  return res(200, { entries: Items || [] });
}

async function getUserEntries(roomId, username) {
  const { Items } = await client.send(new QueryCommand({
    TableName: ENTRIES,
    KeyConditionExpression: 'roomId = :r AND begins_with(userDate, :u)',
    ExpressionAttributeValues: { ':r': roomId, ':u': `${username}#` },
  }));
  return res(200, { entries: Items || [] });
}

// ── Router ───────────────────────────────────────────────────────────────────

export async function handler(event) {
  const method = event.httpMethod;
  const path = event.resource;
  const roomId = event.pathParameters?.roomId;
  const username = event.pathParameters?.username;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { /* empty */ }

  try {
    // POST /rooms
    if (path === '/rooms' && method === 'POST') return await createRoom(body);
    // GET /rooms/{roomId}
    if (path === '/rooms/{roomId}' && method === 'GET') return await getRoom(roomId);
    // POST /rooms/{roomId}/join
    if (path === '/rooms/{roomId}/join' && method === 'POST') return await joinRoom(roomId, body);
    // GET /entries/{roomId}
    if (path === '/entries/{roomId}' && method === 'GET') return await getRoomEntries(roomId);
    // POST /entries/{roomId}
    if (path === '/entries/{roomId}' && method === 'POST') return await logEntry(roomId, body);
    // GET /entries/{roomId}/{username}
    if (path === '/entries/{roomId}/{username}' && method === 'GET') return await getUserEntries(roomId, username);

    return res(404, { error: 'Not found' });
  } catch (err) {
    console.error('Lambda error:', err);
    return res(500, { error: 'Internal server error' });
  }
}
