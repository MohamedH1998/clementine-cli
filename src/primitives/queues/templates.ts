// Queue template interfaces and generators

export interface QueueTemplateOptions {
  queueName: string;
  bindingName: string;
}

export function generateQueueWorkerCode(options: QueueTemplateOptions): string {
  return `// Cloudflare Workers Queue - Producer and Consumer
// This worker acts as both producer (fetch handler) and consumer (queue handler)
// Cloudflare handles scaling and separation at runtime

import { EventStore } from "./event-store";
import dashboardHTML from "./dashboard.html";

interface Env {
  ${options.bindingName}: Queue;
  EVENT_STORE: DurableObjectNamespace;
}

export { EventStore };

interface QueueMessage {
  id: string;
  body: string;
  timestamp: number;
}

type QueuePhase = "pending" | "batched" | "processing" | "acked" | "retry";

// Helper function to log events
async function logEvent(
  store: DurableObjectStub,
  event: string,
  phase: QueuePhase,
  data: Record<string, any> = {}
) {
  const payload = {
    timestamp: Date.now(),
    event,
    phase,
    ...data,
  };

  console.log(JSON.stringify(payload));

  await store.fetch("https://fake/event", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export default {
  // Producer: HTTP endpoint to send messages to queue
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET / - Serve dashboard
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(dashboardHTML, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // GET /events - Query stored events
    if (request.method === "GET" && url.pathname === "/events") {
      const id = env.EVENT_STORE.idFromName("global");
      const store = env.EVENT_STORE.get(id);
      return store.fetch(request);
    }

    // GET /stream - SSE endpoint for real-time updates
    if (request.method === "GET" && url.pathname === "/stream") {
      const id = env.EVENT_STORE.idFromName("global");
      const store = env.EVENT_STORE.get(id);
      return store.fetch(request);
    }

    // DELETE /events - Clear all events
    if (request.method === "DELETE" && url.pathname === "/events") {
      const id = env.EVENT_STORE.idFromName("global");
      const store = env.EVENT_STORE.get(id);
      return store.fetch(request);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Create message ID
    const messageId = crypto.randomUUID().slice(0, 8);
    // Get body from request
    const body = (await request.text()) || "default message";

    // Get Durable Object instance
    const id = env.EVENT_STORE.idFromName("global");
    const store = env.EVENT_STORE.get(id);

    await logEvent(store, "enqueue", "pending", { messageId, body });

    // Send to the queue with message data
    await env.${options.bindingName}.send({
      id: messageId,
      body: body,
      timestamp: Date.now(),
    });

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        messageId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  },

  // Consumer: processes messages from queue
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    // Generate batch ID
    const batchId = crypto.randomUUID().slice(0, 8);

    // Get Durable Object instance
    const id = env.EVENT_STORE.idFromName("global");
    const store = env.EVENT_STORE.get(id);

    // Check if any messages in this batch are retries
    const isRetry = batch.messages.some(msg => msg.attempts > 1);
    const maxAttempts = Math.max(...batch.messages.map(msg => msg.attempts));

    // Log that batch has been delivered (batched)
    await logEvent(store, "batch_delivered", "batched", {
      batchId,
      messageCount: batch.messages.length,
      isRetry,
      maxAttempts,
    });

    try {
      // Log that processing is starting
      await logEvent(store, "batch_processing", "processing", {
        batchId,
        messageCount: batch.messages.length,
      });

      // 20% failure rate to simulate processing errors
      const shouldFail = Math.random() < 0.2

      if (shouldFail) {
        throw new Error("Simulated batch processing failure");
      }

      // Loop through messages and log them
      for (const message of batch.messages) {
        const msg = message.body as QueueMessage;
        const attemptInfo = message.attempts > 1 ? \` (attempt \${message.attempts})\` : '';
        console.log(\`  → Processing: \${msg.id}\${attemptInfo} - "\${msg.body}"\`);

        if (message.attempts > 1) {
          console.log(\`    ⚠️  This is retry #\${message.attempts - 1}\`);
        }
      }

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      batch.ackAll();
      await logEvent(store, "batch_complete", "acked", {
        batchId,
        wasRetry: isRetry,
        attempts: maxAttempts,
      });
    } catch (error) {
      await logEvent(store, "batch_failed", "retry", {
        batchId,
        attempts: maxAttempts,
        willRetry: maxAttempts < 3,
      });
      batch.retryAll();
    }
  },
};
`;
}

export function generateEventStoreCode(): string {
  return `export interface FlowEvent {
  timestamp: number;
  event: string;
  phase: string;
  [key: string]: any;
}

export class EventStore {
  private state: DurableObjectState;
  private events: FlowEvent[] = [];
  private connections: Set<WritableStreamDefaultWriter> = new Set();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /event - Add event
    if (request.method === 'POST' && url.pathname === '/event') {
      const event = await request.json();
      this.events.push(event as FlowEvent);

      // Keep last 100 only
      if (this.events.length > 100) {
        this.events.shift();
      }

      // Broadcast to all SSE connections
      await this.broadcast(event as FlowEvent);

      return new Response('OK');
    }

    // GET /events - Get all events
    if (request.method === 'GET' && url.pathname === '/events') {
      return new Response(JSON.stringify(this.events), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE /events - Clear all events
    if (request.method === 'DELETE' && url.pathname === '/events') {
      this.events = [];
      return new Response('OK');
    }

    // GET /stream - SSE endpoint for real-time updates
    if (request.method === 'GET' && url.pathname === '/stream') {
      return this.handleSSE();
    }

    return new Response('Not Found', { status: 404 });
  }

  private handleSSE(): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Track connection
    this.connections.add(writer);

    // Send initial connection message
    const encoder = new TextEncoder();
    writer.write(encoder.encode('data: connected\\n\\n'));

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  private async broadcast(event: FlowEvent) {
    const encoder = new TextEncoder();
    const data = \`data: \${JSON.stringify(event)}\\n\\n\`;

    for (const writer of this.connections) {
      try {
        await writer.write(encoder.encode(data));
      } catch (error) {
        // Connection closed, remove it
        this.connections.delete(writer);
      }
    }
  }
}
`;
}

export function generateDashboardHTML(): string {
  // Copy the entire dashboard HTML from templates.ts
  // Using the same template for now
  return `<!DOCTYPE html>
 <html lang="en">

 <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>Cloudflare Queues - Live Demo</title>
   <style>
     * {
       margin: 0;
       padding: 0;
       box-sizing: border-box;
     }

     body {
       font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace;
       background: #0a0a0a;
       color: #fafafa;
       -webkit-font-smoothing: antialiased;
       -moz-osx-font-smoothing: grayscale;
     }

     .container {
       max-width: 1600px;
       margin: 0 auto;
       height: 100vh;
       display: flex;
       flex-direction: column;
     }

     /* Header - Stats Bar */
     header {
       border-bottom: 1px solid #262626;
       background: #0f0f0f;
       padding: 16px 24px;
       display: flex;
       justify-content: space-between;
       align-items: center;
       flex-wrap: wrap;
       gap: 16px;
     }

     .stats {
       display: flex;
       gap: 32px;
       font-size: 12px;
       font-weight: 500;
     }

     .stat-item {
       display: flex;
       align-items: center;
       gap: 8px;
     }

     .stat-label {
       color: #737373;
       text-transform: uppercase;
       letter-spacing: 0.05em;
       font-size: 10px;
     }

     .stat-value {
       color: #fafafa;
       font-weight: 700;
       font-size: 14px;
       font-variant-numeric: tabular-nums;
     }

     .header-actions {
       display: flex;
       gap: 12px;
       align-items: center;
     }

     .instance-label {
       font-size: 10px;
       color: #404040;
       text-transform: uppercase;
       letter-spacing: 0.1em;
     }

     button {
       font-family: inherit;
       font-size: 10px;
       font-weight: 500;
       text-transform: uppercase;
       letter-spacing: 0.05em;
       padding: 8px 16px;
       border: 1px solid #404040;
       background: transparent;
       color: #737373;
       cursor: pointer;
       transition: all 0.15s ease;
     }

     button:hover {
       background: #1a1a1a;
       border-color: #737373;
       color: #fafafa;
     }

     button:active {
       transform: scale(0.98);
     }

     button.primary {
       background: #fafafa;
       color: #0a0a0a;
       border-color: #fafafa;
     }

     button.primary:hover {
       background: #e0e0e0;
       border-color: #e0e0e0;
     }

     /* Main Content - 3 Column Grid */
     main {
       flex: 1;
       display: grid;
       grid-template-columns: 1fr 1fr 1fr;
       border-top: 1px solid #262626;
     }

     section {
       border-right: 1px solid #262626;
       display: flex;
       flex-direction: column;
     }

     section:last-child {
       border-right: none;
     }

     .section-header {
       padding: 12px 16px;
       border-bottom: 1px solid #262626;
       font-size: 10px;
       color: #737373;
       text-transform: uppercase;
       letter-spacing: 0.1em;
       background: #0f0f0f;
     }

     .section-content {
       flex: 1;
       padding: 16px;
       overflow-y: auto;
     }

     /* Producer Panel */
     .producer .enqueue-btn {
       width: 100%;
       padding: 16px;
       margin-bottom: 24px;
       font-size: 12px;
     }

     .queue-status {
       font-size: 10px;
       color: #737373;
       margin-bottom: 12px;
       display: flex;
       justify-content: space-between;
     }

     .queue-count {
       color: #fafafa;
       font-variant-numeric: tabular-nums;
     }

     .queue-messages {
       border: 1px solid #262626;
       background: #000;
       padding: 12px;
       min-height: 120px;
     }

     .queue-message {
       display: flex;
       align-items: center;
       gap: 8px;
       font-size: 10px;
       color: #737373;
       margin-bottom: 6px;
       animation: fadeIn 0.2s ease;
     }

     .bullet {
       width: 4px;
       height: 4px;
       background: #737373;
     }

     .timeout-info {
       margin-top: 12px;
       font-size: 9px;
       color: #404040;
       text-transform: uppercase;
       letter-spacing: 0.05em;
     }

     /* Consumer Panel */
     .consumer .section-content {
       display: flex;
       align-items: center;
       justify-content: center;
       background: #0f0f0f;
     }

     .batch-card {
       width: 100%;
       max-width: 280px;
       border: 2px solid;
       padding: 16px;
       animation: fadeIn 0.3s ease;
     }

     .batch-card.batched {
       border-color: #3b82f6;
       background: rgba(59, 130, 246, 0.05);
     }

     .batch-card.processing {
       border-color: #f56500;
       background: rgba(245, 101, 0, 0.05);
     }

     .batch-card.acked {
       border-color: #22c55e;
       background: rgba(34, 197, 94, 0.05);
     }

     .batch-card.retry {
       border-color: #ef4444;
       background: rgba(239, 68, 68, 0.05);
     }

     .batch-header {
       display: flex;
       justify-content: space-between;
       align-items: center;
       margin-bottom: 12px;
     }

     .batch-status {
       font-size: 10px;
       font-weight: 700;
       text-transform: uppercase;
       letter-spacing: 0.05em;
     }

     .batch-card.batched .batch-status {
       color: #3b82f6;
     }

     .batch-card.processing .batch-status {
       color: #f56500;
     }

     .batch-card.acked .batch-status {
       color: #22c55e;
     }

     .batch-card.retry .batch-status {
       color: #ef4444;
     }

     .batch-count {
       font-size: 9px;
       color: #737373;
       font-variant-numeric: tabular-nums;
     }

     .batch-id {
       font-size: 8px;
       color: #404040;
       font-family: ui-monospace, monospace;
       margin-bottom: 12px;
       word-break: break-all;
     }

     .batch-messages {
       margin: 12px 0;
     }

     .batch-messages .queue-message {
       margin-bottom: 4px;
     }

     .progress-bar {
       height: 3px;
       background: #262626;
       margin-top: 12px;
       overflow: hidden;
     }

     .progress-fill {
       height: 100%;
       background: #f56500;
       animation: progress 1.5s linear;
     }

     .idle-state {
       font-size: 10px;
       color: #404040;
       font-style: italic;
     }

     /* Event Log Panel */
     .event-log .section-content {
       padding: 0;
       background: #000;
       max-height: 90vh;
       overflow-y: auto;
     }

     .event {
       padding: 12px 16px;
       border-bottom: 1px solid #1a1a1a;
       font-size: 10px;
       line-height: 1.6;
       animation: fadeIn 0.2s ease;
     }

     .event:hover {
       background: #0f0f0f;
     }

     .event-header {
       display: flex;
       justify-content: space-between;
       align-items: center;
       margin-bottom: 4px;
     }

     .event-phase {
       font-weight: 700;
       text-transform: uppercase;
       letter-spacing: 0.05em;
       font-size: 9px;
     }

     .event.pending .event-phase {
       color: #999999;
     }

     .event.batched .event-phase {
       color: #3b82f6;
     }

     .event.processing .event-phase {
       color: #f56500;
     }

     .event.acked .event-phase {
       color: #22c55e;
     }

     .event.retry .event-phase {
       color: #ef4444;
     }

     .event-time {
       font-size: 8px;
       color: #404040;
       font-variant-numeric: tabular-nums;
     }

     .event-name {
       color: #737373;
       margin-bottom: 2px;
     }

     .event-data {
       color: #404040;
       font-size: 9px;
       word-break: break-all;
     }

     /* Animations */
     @keyframes fadeIn {
       from {
         opacity: 0;
         transform: translateY(-4px);
       }

       to {
         opacity: 1;
         transform: translateY(0);
       }
     }

     @keyframes progress {
       from {
         width: 0%;
       }

       to {
         width: 100%;
       }
     }

     @keyframes pulse {

       0%,
       100% {
         opacity: 1;
       }

       50% {
         opacity: 0.7;
       }
     }

     /* Responsive */
     @media (max-width: 1024px) {
       main {
         grid-template-columns: 1fr 1fr;
       }

       .event-log {
         grid-column: 1 / -1;
       }
     }

     @media (max-width: 768px) {
       main {
         grid-template-columns: 1fr;
       }

       section {
         border-right: none;
         border-bottom: 1px solid #262626;
       }

       section:last-child {
         border-bottom: none;
       }
     }

     /* Reduced Motion */
     @media (prefers-reduced-motion: reduce) {
       * {
         animation-duration: 0.01ms !important;
         animation-iteration-count: 1 !important;
         transition-duration: 0.01ms !important;
       }
     }
   </style>
 </head>

 <body>
   <div class="container">
     <header>
       <div class="stats">
         <div class="stat-item">
           <span class="stat-label">Enqueued</span>
           <span class="stat-value" id="stat-enqueued">0</span>
         </div>
         <div class="stat-item">
           <span class="stat-label">Processed</span>
           <span class="stat-value" id="stat-processed">0</span>
         </div>
         <div class="stat-item">
           <span class="stat-label">Retried</span>
           <span class="stat-value" id="stat-retried">0</span>
         </div>
       </div>
       <div class="header-actions">
         <span class="instance-label">Queue Instance</span>
         <button onclick="resetDemo()">Reset</button>
       </div>
     </header>

     <main>
       <!-- Producer Panel -->
       <section class="producer">
         <div class="section-header">[Producer]</div>
         <div class="section-content">
           <button class="enqueue-btn primary" onclick="enqueueMessage()">
             Enqueue Message
           </button>

           <div class="queue-status">
             <span>Queue</span>
             <span class="queue-count">
               <span id="queue-count">0</span>/4
             </span>
           </div>

           <div class="queue-messages" id="queue-messages">
             <!-- Messages will be inserted here -->
           </div>

           <div class="timeout-info">Batch timeout: 3000ms</div>
         </div>
       </section>

       <!-- Consumer Panel -->
       <section class="consumer">
         <div class="section-header">[Consumer Worker]</div>
         <div class="section-content" id="consumer-content">
           <div class="idle-state">Waiting for batch...</div>
         </div>
       </section>

       <!-- Event Log Panel -->
       <section class="event-log">
         <div class="section-header">Event Log</div>
         <div class="section-content" id="event-log">
           <!-- Events will be inserted here -->
         </div>
       </section>
     </main>
   </div>

   <script>
     let messageCounter = 0;
     let currentQueue = [];
     let lastEventCount = 0;
     let lastLogEventCount = 0;
     let updatePending = false;
     let activeBatch = null;
     let lastRenderedBatchState = null;

     // Enqueue a message
     async function enqueueMessage() {
       const messageBody = \`MSG_\${++messageCounter}\`;

       try {
         const response = await fetch('/', {
           method: 'POST',
           body: messageBody
         });

         if (response.ok) {
           console.log('Enqueued:', messageBody);
         }
       } catch (error) {
         console.error('Failed to enqueue:', error);
       }
     }

     // Reset demo
     async function resetDemo() {
       try {
         // Clear events in Durable Object
         await fetch('/events', { method: 'DELETE' });

         // Reset local state
         messageCounter = 0;
         currentQueue = [];
         lastEventCount = 0;
         lastLogEventCount = 0;
         updatePending = false;
         activeBatch = null;
         lastRenderedBatchState = null;

         // Clear UI
         updateStats({ enqueued: 0, processed: 0, retried: 0 });
         document.getElementById('queue-messages').innerHTML = '';
         document.getElementById('queue-count').textContent = '0';
         document.getElementById('event-log').innerHTML = '<div class="idle-state" style="padding: 16px;">No events yet...</div>';
         document.getElementById('consumer-content').innerHTML = '<div class="idle-state">Waiting for batch...</div>';

         console.log('Demo reset complete');
       } catch (error) {
         console.error('Failed to reset demo:', error);
       }
     }

     // Update stats
     function updateStats(stats) {
       document.getElementById('stat-enqueued').textContent = stats.enqueued;
       document.getElementById('stat-processed').textContent = stats.processed;
       document.getElementById('stat-retried').textContent = stats.retried;
     }

     // Calculate stats from events
     function calculateStats(events) {
       return {
         enqueued: events.filter(e => e.phase === 'pending').length,
         processed: events.filter(e => e.event === 'batch_complete').length,
         retried: events.filter(e => e.phase === 'retry').length
       };
     }

     // Update queue display
     function updateQueue(events) {
       const enqueuedMessages = events.filter(e => e.event === 'enqueue');
       const deliveredEvents = events.filter(e => e.event === 'batch_delivered');

       // Calculate total messages delivered to batches (picked up from queue)
       let totalDelivered = 0;
       deliveredEvents.forEach(de => {
         totalDelivered += (de.messageCount || 0);
       });

       // Messages still waiting in queue = total enqueued - total picked up
       // Show the ones that haven't been delivered yet (still waiting)
       const queueMessages = enqueuedMessages
         .slice(totalDelivered)  // Skip the ones already picked up
         .slice(-4);             // Show last 4 waiting

       const queueContainer = document.getElementById('queue-messages');
       const queueCount = document.getElementById('queue-count');

       queueCount.textContent = queueMessages.length;

       if (queueMessages.length === 0) {
         queueContainer.innerHTML = '';
         return;
       }

       queueContainer.innerHTML = queueMessages.reverse().map(msg => \`
         <div class="queue-message">
           <span class="bullet"></span>
           <span>\${msg.body || msg.messageId}</span>
         </div>
       \`).join('');
     }

     // Update consumer display
     function updateConsumer(events) {
       const consumerContent = document.getElementById('consumer-content');

       const batchEvents = events.filter(e =>
         ['batch_delivered', 'batch_processing', 'batch_complete', 'batch_failed'].includes(e.event)
       );

       // Sort batch events chronologically to handle SSE race conditions
       const sortedEvents = [...batchEvents].sort((a, b) => a.timestamp - b.timestamp);

       // Replay batch events to build current batch state
       let currentBatch = null;

       for (const event of sortedEvents) {
         if (event.event === 'batch_delivered') {
           currentBatch = {
             batchId: event.batchId,
             status: 'delivered',
             data: event
           };
         } else if (event.event === 'batch_processing' && currentBatch?.batchId === event.batchId) {
           currentBatch.status = 'processing';
         } else if (event.event === 'batch_complete' && currentBatch?.batchId === event.batchId) {
           currentBatch = null; // Batch finished, clear state
         } else if (event.event === 'batch_failed' && currentBatch?.batchId === event.batchId) {
           currentBatch.status = 'failed';
         }
       }

       // Create state signature for comparison
       const stateSignature = currentBatch
         ? \`\${currentBatch.batchId}-\${currentBatch.status}\`
         : 'idle';

       // Only re-render if state actually changed
       if (stateSignature === lastRenderedBatchState) {
         return;
       }

       lastRenderedBatchState = stateSignature;

       // Render based on current batch state
       if (!currentBatch) {
         consumerContent.innerHTML = '<div class="idle-state">Waiting for batch...</div>';
         return;
       }

       // Determine display status
       let displayStatus = currentBatch.status === 'delivered' ? 'batched' : currentBatch.status;
       let statusLabel = displayStatus;

       // Handle retry logic for display
       const isRetryBatch = currentBatch.data.isRetry || false;
       const attempts = currentBatch.data.maxAttempts || 1;

       if (currentBatch.status === 'failed') {
         displayStatus = 'retry';
         statusLabel = 'failed';
       } else if (isRetryBatch && currentBatch.status === 'delivered') {
         displayStatus = 'retry';
         statusLabel = \`retry pending <span style="color: #f59e0b; font-size: 9px;">(attempt \${attempts})</span>\`;
       } else if (isRetryBatch && currentBatch.status === 'processing') {
         displayStatus = 'processing';
         statusLabel = \`retrying <span style="color: #f59e0b; font-size: 9px;">(attempt \${attempts})</span>\`;
       }

       // Render batch card
       consumerContent.innerHTML = \`
         <div class="batch-card \${displayStatus}">
           <div class="batch-header">
             <span class="batch-status">\${statusLabel}</span>
             <span class="batch-count">\${currentBatch.data.messageCount || 0} msgs</span>
           </div>
           <div class="batch-id">\${currentBatch.batchId || 'unknown'}</div>
           \${currentBatch.status === 'processing' ? '<div class="progress-bar"><div class="progress-fill"></div></div>' : ''}
         </div>
       \`;
     }

     // Format time ago
     function timeAgo(timestamp) {
       const seconds = Math.floor((Date.now() - timestamp) / 1000);
       if (seconds < 1) return 'just now';
       if (seconds < 60) return \`\${seconds}s ago\`;
       const minutes = Math.floor(seconds / 60);
       if (minutes < 60) return \`\${minutes}m ago\`;
       return 'long ago';
     }

     // Update event log
     function updateEventLog(events) {
       const logContainer = document.getElementById('event-log');

       // Filter out pending events (shown in queue instead)
       const nonPendingEvents = events.filter(e => e.phase !== 'pending');

       // Only update if the count of non-pending events changed
       if (nonPendingEvents.length === lastLogEventCount) {
         return;
       }
       lastLogEventCount = nonPendingEvents.length;

       if (nonPendingEvents.length === 0) {
         logContainer.innerHTML = '<div class="idle-state" style="padding: 16px;">No events yet...</div>';
         return;
       }

       // Show last 20 events, newest first
       const recentEvents = nonPendingEvents.slice(-20).reverse();

       logContainer.innerHTML = recentEvents.map(event => {
         const data = { ...event };
         delete data.timestamp;
         delete data.event;
         delete data.phase;

         const dataStr = JSON.stringify(data).slice(0, 60);

         // Build retry indicator (only for processing and retry phases, not acked)
         let retryBadge = '';
         let attemptInfo = '';

         if (event.phase !== 'acked') {

           // Show attempt number if available
           if (event.maxAttempts > 1 || event.attempts > 1) {
             const attempts = event.maxAttempts || event.attempts || 1;
             attemptInfo = \` <span style="color: #737373; font-size: 9px;">(attempt \${attempts})</span>\`;
           }
         }

         return \`
           <div class="event \${event.phase}">
             <div class="event-header">
               <span class="event-phase">[\${event.phase}]\${retryBadge}\${attemptInfo}</span>
               <span class="event-time">\${timeAgo(event.timestamp)}</span>
             </div>
             <div class="event-name">\${event.event}</div>
             <div class="event-data">\${dataStr}\${dataStr.length >= 60 ? '...' : ''}</div>
           </div>
         \`;
       }).join('');
     }

     // Fetch and update UI
     async function fetchAndUpdate() {
       try {
         const response = await fetch('/events');
         if (!response.ok) throw new Error('Failed to fetch events');

         const events = await response.json();

         // Only update if new events
         if (events.length !== lastEventCount) {
           lastEventCount = events.length;

           const stats = calculateStats(events);
           updateStats(stats);
           updateQueue(events);
           updateConsumer(events);
           updateEventLog(events);
         }
       } catch (error) {
         console.error('Failed to fetch events:', error);
       }
     }

     // Connect to SSE stream for real-time updates
     function connectSSE() {
       const eventSource = new EventSource('/stream');

       eventSource.addEventListener('message', (e) => {
         // Skip initial connection message
         if (e.data === 'connected') {
           console.log('SSE connected');
           return;
         }

         try {
           const event = JSON.parse(e.data);

           // Priority events: batch state changes should update immediately
           // This ensures users always see processing states, not instant completion
           const isPriorityEvent = ['batch_delivered', 'batch_processing', 'batch_complete', 'batch_failed'].includes(event.event);

           if (isPriorityEvent) {
             // Cancel any pending batched update and update immediately
             updatePending = false;
             fetchAndUpdate();
           } else {
             // Batch non-priority events (enqueues) to prevent UI thrashing
             if (!updatePending) {
               updatePending = true;
               requestAnimationFrame(() => {
                 updatePending = false;
                 fetchAndUpdate();
               });
             }
           }
         } catch (error) {
           // If parsing fails, fall back to batched update
           if (!updatePending) {
             updatePending = true;
             requestAnimationFrame(() => {
               updatePending = false;
               fetchAndUpdate();
             });
           }
         }
       });

       eventSource.addEventListener('error', (error) => {
         console.log('SSE connection error, will auto-reconnect', error);
       });

       eventSource.addEventListener('open', () => {
         console.log('SSE connection opened');
       });
     }

     // Initial load and SSE connection
     fetchAndUpdate();
     connectSSE();
   </script>
 </body>

 </html>`;
}
