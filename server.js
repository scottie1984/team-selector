const express = require('express');
const bodyParser = require('body-parser');
const teamer = require('./teamer');
const app = express();
const port = process.env.PORT || 5000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/api/teams', async (req, res) => {
    const players = await teamer.meetup()
    res.json(players);
});

app.get('/api/recent', async (req, res) => {
    const recent = await teamer.recentevents()
    res.json(recent);
});

app.get('/api/event/:id', async (req, res) => {
    const eventPlayers = await teamer.getEvent(req.params.id)
    const record = await teamer.getRecord(req.params.id)
    res.json({ eventPlayers, record });
});

app.post('/api/record', async (req, res) => {
  console.log(req.body);
  const event = await teamer.play(req.body.id, req.body.winners, req.body.losers)
  res.json({});
});

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = await teamer.leaderboard()
    res.json(leaderboard);
});

app.listen(port, () => console.log(`Listening on port ${port}`));
