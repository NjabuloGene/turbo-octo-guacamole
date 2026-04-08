// GET /api/users
app.get('/api/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
});

// POST /api/users
app.post('/api/users', (req, res) => {
  // We'll add request body parsing later
  res.status(201).json({ message: 'User created' });
});

// GET /api/users/:id
app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  res.json({ id: userId, name: 'Sample User' });
});