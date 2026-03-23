#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

class WeightTrackerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── DynamoDB Tables ──────────────────────────────────────────────────

    // Rooms table: stores room metadata
    const roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      tableName: 'wt-rooms',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Entries table: stores weight entries per room per user
    const entriesTable = new dynamodb.Table(this, 'EntriesTable', {
      tableName: 'wt-entries',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userDate', type: dynamodb.AttributeType.STRING }, // "username#2026-03-23"
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI to query entries by user across rooms
    entriesTable.addGlobalSecondaryIndex({
      indexName: 'by-user',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
    });

    // ── Lambda Function ──────────────────────────────────────────────────

    const apiFn = new lambda.Function(this, 'ApiFunction', {
      functionName: 'wt-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        ENTRIES_TABLE: entriesTable.tableName,
      },
    });

    roomsTable.grantReadWriteData(apiFn);
    entriesTable.grantReadWriteData(apiFn);

    // ── API Gateway ──────────────────────────────────────────────────────

    const api = new apigateway.RestApi(this, 'WeightTrackerApi', {
      restApiName: 'weight-tracker',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Room-Id', 'X-Username'],
      },
    });

    const integration = new apigateway.LambdaIntegration(apiFn);

    // POST   /rooms          → create room
    // GET    /rooms/{id}     → get room info
    // POST   /rooms/{id}/join → join room
    const rooms = api.root.addResource('rooms');
    rooms.addMethod('POST', integration);

    const room = rooms.addResource('{roomId}');
    room.addMethod('GET', integration);

    const join = room.addResource('join');
    join.addMethod('POST', integration);

    // GET    /entries/{roomId}           → get all entries for room
    // POST   /entries/{roomId}           → log weight entry
    // GET    /entries/{roomId}/{username} → get entries for user in room
    const entries = api.root.addResource('entries');
    const roomEntries = entries.addResource('{roomId}');
    roomEntries.addMethod('GET', integration);
    roomEntries.addMethod('POST', integration);

    const userEntries = roomEntries.addResource('{username}');
    userEntries.addMethod('GET', integration);

    // ── Outputs ──────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });
  }
}

const app = new cdk.App();
new WeightTrackerStack(app, 'WeightTrackerStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
