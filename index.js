const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const PORT = 3000;
const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Database connection settings
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '123321',
    database: 'todolist',
};

// Helper function to verify JWT
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Authentication middleware
async function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
        return;
    }

    req.user = decoded;
    next();
}

// User registration
async function registerUser(username, password) {
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const connection = await mysql.createConnection(dbConfig);
        const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
        const [result] = await connection.execute(query, [username, hashedPassword]);
        await connection.end();
        return result.insertId;
    } catch (error) {
        console.error('Error registering user:', error);
        throw error;
    }
}

// User login
async function loginUser(username, password) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT * FROM users WHERE username = ?';
        const [rows] = await connection.execute(query, [username]);
        await connection.end();

        if (rows.length === 0) {
            throw new Error('User not found');
        }

        const user = rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            throw new Error('Invalid password');
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        return { token, userId: user.id };
    } catch (error) {
        console.error('Error logging in:', error);
        throw error;
    }
}

// Modified CRUD operations to include user_id
async function retrieveListItems(userId) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT id, text FROM items WHERE user_id = ? ORDER BY id';
        const [rows] = await connection.execute(query, [userId]);
        await connection.end();
        return rows;
    } catch (error) {
        console.error('Error retrieving list items:', error);
        throw error;
    }
}

async function addListItem(text, userId) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'INSERT INTO items (text, user_id) VALUES (?, ?)';
        const [result] = await connection.execute(query, [text, userId]);
        await connection.end();
        return { id: result.insertId, text };
    } catch (error) {
        console.error('Error adding list item:', error);
        throw error;
    }
}

async function deleteListItem(id, userId) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'DELETE FROM items WHERE id = ? AND user_id = ?';
        const [result] = await connection.execute(query, [id, userId]);
        await connection.end();
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error deleting list item:', error);
        throw error;
    }
}

async function updateListItem(id, text, userId) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'UPDATE items SET text = ? WHERE id = ? AND user_id = ?';
        const [result] = await connection.execute(query, [text, id, userId]);
        await connection.end();
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error updating list item:', error);
        throw error;
    }
}

async function getHtmlRows(userId) {
    const todoItems = await retrieveListItems(userId);
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
    if (req.url === '/' && req.method === 'GET') {
        try {
            const html = await fs.promises.readFile(
                path.join(__dirname, 'index.html'),
                'utf8'
            );
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading index.html');
        }
    } else if (req.url === '/login' && req.method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                const { username, password } = JSON.parse(body);
                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username and password are required' }));
                    return;
                }

                const { token, userId } = await loginUser(username, password);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                });
                res.end(JSON.stringify({ token, userId }));
            });
        } catch (error) {
            console.error(error);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (req.url === '/register' && req.method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                const { username, password } = JSON.parse(body);
                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username and password are required' }));
                    return;
                }

                const userId = await registerUser(username, password);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ userId }));
            });
        } catch (error) {
            console.error(error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (req.url === '/api/items' && req.method === 'GET') {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const html = await getHtmlRows(decoded.id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ html }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    } else if (req.url === '/api/items' && req.method === 'POST') {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
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

                const newItem = await addListItem(text, decoded.id);
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
            const token = req.headers.authorization?.split(' ')[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const id = req.url.split('/')[3];
            if (!id || isNaN(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid ID' }));
                return;
            }

            const deleted = await deleteListItem(id, decoded.id);
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
            const token = req.headers.authorization?.split(' ')[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

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

                const updated = await updateListItem(id, text, decoded.id);
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

const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));