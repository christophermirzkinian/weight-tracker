# Weight Tracker — AWS Multiplayer Backend

## Architecture

- **DynamoDB** — Two tables: `wt-rooms` (room metadata + members) and `wt-entries` (weight entries per room/user)
- **Lambda** — Single Node.js 20 function handling all API routes
- **API Gateway** — REST API with CORS enabled

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /rooms | Create a new room |
| GET | /rooms/{roomId} | Get room info and members |
| POST | /rooms/{roomId}/join | Join an existing room |
| GET | /entries/{roomId} | Get all weight entries for a room |
| POST | /entries/{roomId} | Log a weight entry |
| GET | /entries/{roomId}/{username} | Get entries for a specific user |

## Deploy

```bash
cd aws
npm install
npx cdk bootstrap   # first time only
npx cdk deploy
```

After deploy, copy the API URL from the output and paste it into the Group tab settings in the app.

## Room System

1. One user creates a room → gets a 6-character code
2. Share the code with friends
3. Friends enter code + their display name to join
4. Everyone's weight entries sync to the shared room
5. Group chart and weekly loss leaderboard update in real-time
