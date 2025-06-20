const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const TelegramBot = require('node-telegram-bot-api');

const PORT = 3000;

// Database connection settings
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '123321',
    database: 'todolist',
};

// Telegram bot configuration
const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'; // Replace with your actual bot token
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// CORS configuration
const allowedOrigins = ['http://localhost', 'http://localhost:3000'];

// Initialize Telegram bot commands
function initializeTelegramBot() {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(
            chatId,
            `Welcome to To-Do List Bot! Here's what you can do:
            
/add <task> - Add a new task
/list - View all tasks
/delete <task_id> - Delete a task
/help - Show this help message`
        );
    });

    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(
            chatId,
            `Available commands:
            
/add <task> - Add a new task
/list - View all tasks
/delete <task_id> - Delete a task
/help - Show this help message`
        );
    });

    bot.onText(/\/add (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const taskText = match[1];

        try {
            const newItem = await addListItem(taskText);
            bot.sendMessage(chatId, `Task added successfully with ID: ${newItem.id}`);
        } catch (error) {
            bot.sendMessage(chatId, `Error: ${error.message}`);
        }
    });

    bot.onText(/\/list/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            const items = await retrieveListItems();
            let message = 'Your To-Do List:\n\n';

            if (items.length === 0) {
                message = 'Your to-do list is empty!';
            } else {
                items.forEach(item => {
                    message += `${item.id}. ${item.text}\n`;
                });
            }

            bot.sendMessage(chatId, message);
        } catch (error) {
            bot.sendMessage(chatId, `Error: ${error.message}`);
        }
    });

    bot.onText(/\/delete (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const taskId = match[1];

        try {
            const deleted = await deleteListItem(taskId);
            if (deleted) {
                bot.sendMessage(chatId, `Task ${taskId} deleted successfully`);
            } else {
                bot.sendMessage(chatId, `Task ${taskId} not found`);
            }
        } catch (error) {
            bot.sendMessage(chatId, `Error: ${error.message}`);
        }
    });

    console.log('Telegram bot is running...');
}

// Database functions
async function retrieveListItems() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT id, text FROM items ORDER BY id';
        const [rows] = await connection.execute(query);
        await connection.end();
        return rows;
    } catch (error) {
        console.error('Error retrieving list items:', error);
        throw error;
    }
}

async function addListItem(text) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'INSERT INTO items (text) VALUES (?)';
        const [result] = await connection.execute(query, [text]);
        await connection.end();
        return { id: result.insertId, text };
    } catch (error) {
        console.error('Error adding list item:', error);
        throw error;
    }
}

async function deleteListItem(id) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'DELETE FROM items WHERE id = ?';
        const [result] = await connection.execute(query, [id]);
        await connection.end();
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error deleting list item:', error);
        throw error;
    }
}

async function updateListItem(id, text) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'UPDATE items SET text = ? WHERE id = ?';
        const [result] = await connection.execute(query, [text, id]);
        await connection.end();
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error updating list item:', error);
        throw error;
    }
}

async function getHtmlRows() {
    const todoItems = await retrieveListItems();
    return todoItems.map(item => `
        <tr data-id="${item.id}">
            <td>${item.id}</td>
            <td>
                <span class="item-text">${escapeHtml(item.text)}</span>
                <div class="edit-form">
                    <input type="text" value="${escapeHtml(item.text)}">
                    <button onclick="saveEdit(${item.id})">Save</button>
                    <button onclick="cancelEdit(${item.id})">Cancel</button>
                </div>
            </td>
            <td>
                <button class="edit-btn" onclick="enableEdit(${item.id})">Edit</button>
                <button onclick="removeItem(${item.id})">Remove</button>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function handleRequest(req, res) {
    // Add CORS headers
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/' && req.method === 'GET') {
        try {
            const html = await fs.promises.readFile(
                path.join(__dirname, 'index.html'),
                'utf8'
            );
            const processedHtml = html.replace('{{rows}}', await getHtmlRows());
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(processedHtml);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading index.html');
        }
    } else if (req.url === '/api/items' && req.method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                const { text } = JSON.parse(body);
                if (!text) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Text is required' }));
                    return;
                }

                const newItem = await addListItem(text);
                res.writeHead(201, {
                    'Content-Type': 'application/json',
                    'Location': `/api/items/${newItem.id}`
                });
                res.end(JSON.stringify(newItem));
            });
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    } else if (req.url.startsWith('/api/items/') && req.method === 'DELETE') {
        try {
            const id = req.url.split('/')[3];
            if (!id || isNaN(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid ID' }));
                return;
            }

            const deleted = await deleteListItem(id);
            if (!deleted) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Item not found' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    } else if (req.url.startsWith('/api/items/') && req.method === 'PUT') {
        try {
            const id = req.url.split('/')[3];
            if (!id || isNaN(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid ID' }));
                return;
            }

            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                const { text } = JSON.parse(body);
                if (!text) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Text is required' }));
                    return;
                }

                const updated = await updateListItem(id, text);
                if (!updated) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Item not found' }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Route not found');
    }
}

// Start the server and Telegram bot
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initializeTelegramBot();
});