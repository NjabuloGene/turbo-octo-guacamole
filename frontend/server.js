const expess = require("express");
const bodyParser = require("body-parser");
const cors = require("mysql2");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "login_demo"
})

db.connect(err => {
    if (err) throw err;
    console.log("database connected")
})

//login endpoint
app.post("/login", (req, res) =>{
    const { username, password} = req.body;

    const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.query(sql, [username, password]),
    (err, result) => {
        if (err) {
            erturn
            res.status(500).json({ message: "Server error"});
         }
         if (result.length > 0) {
            res.json({message: "Login succesful!"});
         } else {
            res.status(401).json({messaage:"Invalid Credentials"});
             }
        }
});

app.listen(300, () => {
    console.log("Server running on htps://localhost:3000")
})