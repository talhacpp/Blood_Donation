require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt'); 
const fs = require('fs');
const session = require('express-session'); 

const app = express();
const port = process.env.PORT || 8081;

// ------------------ MIDDLEWARE ------------------
// Serve static files from public folder (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: false
}));

// ------------------ DATABASE ------------------
mongoose.connect(process.env.DATABASE_URL);
const db = mongoose.connection;
db.once('open', () => console.log("✅ MongoDB connection successful"));

// ------------------ USER SCHEMA ------------------
const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    username: String,
    mobile: String,
    blood: String,
    hometown: String,
    lastDonation: Date
});
const Users = mongoose.model("Users", userSchema);

// ------------------ HELPER ------------------
function renderMessage(htmlFile, message = '', redirect = '') {
    let html = fs.readFileSync(path.join(__dirname, 'public', htmlFile), 'utf8');

    if (message) {
        const script = `
            <script>
                alert("${message}");
                ${redirect ? `window.location.href='${redirect}';` : ''}
            </script>
        `;
        html = html.replace('</body>', `${script}</body>`);
    }

    return html;
}

// ------------------ ROUTES ------------------

// Root - login page
app.get('/', (req, res) => res.send(renderMessage('index.html')));

// Registration page
app.get('/register', (req, res) => res.send(renderMessage('register.html')));

// Register user
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, bloodGroup, district, contactNumber } = req.body;

        const existingUser = await Users.findOne({ email });
        if (existingUser) {
            return res.send(renderMessage('register.html', "Email already exists"));
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new Users({
            email,
            password: hashedPassword,
            username,
            mobile: contactNumber,
            blood: bloodGroup,
            hometown: district,
            lastDonation: null
        });

        await user.save();
        res.send(renderMessage('index.html', "Registration Successful! Please login"));
    } catch (error) {
        console.error(error);
        res.send(renderMessage('register.html', "Internal Server Error 🚨"));
    }
});

// Login user
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await Users.findOne({ email });
        if (!user) return res.send(renderMessage('index.html', "User not found"));

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.send(renderMessage('index.html', "Wrong password"));

        req.session.user = {
            email: user.email,
            username: user.username
        };

        res.redirect('/home');  

    } catch (error) {
        console.error(error);
        res.send(renderMessage('index.html', "Something went wrong 🚨"));
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.send("Error logging out");
        res.redirect('/');
    });
});

// Home page - protected
app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.send(`
            <script>
                alert("You are not logged in. Redirecting to login page...");
                window.location.href = '/';
            </script>
        `);
    }
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Profile page - protected
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.send(`
            <script>
                alert("You are not logged in. Redirecting to login page...");
                window.location.href = '/';
            </script>
        `);
    }
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Profile data API
app.get('/profile-data', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

    try {
        const { email } = req.session.user;
        const user = await Users.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            email: user.email,
            username: user.username,
            mobile: user.mobile || '',
            bloodGroup: user.blood || '',
            hometown: user.hometown || '',
            lastDonation: user.lastDonation ? user.lastDonation.toISOString().split("T")[0] : ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Update profile
app.post('/updateProfile', async (req, res) => {
    if (!req.session.user) return res.send("You are not logged in");

    try {
        const { email } = req.session.user;
        const { username, mobile, hometown, lastDonation } = req.body;

        const user = await Users.findOne({ email });
        if (!user) return res.send("User not found");

        user.username = username;
        user.mobile = mobile;
        user.hometown = hometown;
        if (lastDonation) user.lastDonation = new Date(lastDonation);
        await user.save();

        req.session.user.username = username;

        res.redirect('/profile');
    } catch (error) {
        console.error(error);
        res.send("Something went wrong 🚨");
    }
});

// Donor List API
app.get('/donorlist', async (req, res) => {
    try {
        const donors = await Users.find({}, {
            username: 1,
            blood: 1,
            mobile: 1,
            lastDonation: 1,
            _id: 0
        });
        res.json(donors);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch donors" });
    }
});

// ------------------ START SERVER ------------------
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
