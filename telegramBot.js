const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// Replace with your Telegram bot token
const TELEGRAM_TOKEN = '8180316670:AAGnqPdjECnSrnODVXbd3njtG5tsd521Fc0';
const SERVER_URL = 'http://localhost:3000';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

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
        const response = await makeRequest('POST', '/api/items', { text: taskText });
        bot.sendMessage(chatId, `Task added successfully with ID: ${response.id}`);
    } catch (error) {
        bot.sendMessage(chatId, `Error: ${error.message}`);
    }
});

bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const items = await makeRequest('GET', '/');
        let message = 'Your To-Do List:\n\n';

        // Parse the HTML to extract tasks (simplified approach)
        const taskRegex = /<tr data-id="(\d+)">\s*<td>\d+<\/td>\s*<td>\s*<span class="item-text">([^<]+)<\/span>/g;
        let match;
        while ((match = taskRegex.exec(items)) !== null) {
            message += `${match[1]}. ${match[2]}\n`;
        }

        if (message === 'Your To-Do List:\n\n') {
            message = 'Your to-do list is empty!';
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
        await makeRequest('DELETE', `/api/items/${taskId}`);
        bot.sendMessage(chatId, `Task ${taskId} deleted successfully`);
    } catch (error) {
        bot.sendMessage(chatId, `Error: ${error.message}`);
    }
});

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    const error = JSON.parse(body).error || 'Unknown error';
                    reject(new Error(error));
                } else {
                    resolve(body ? JSON.parse(body) : {});
                }
            });
        });

        req.on('error', (error) => reject(error));

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

console.log('Telegram bot is running...');