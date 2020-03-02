const { rate, Rating, expose } = require('ts-trueskill');
const fs = require('fs-extra')
const _ = require('lodash')
const request = require('request-promise-native')
const fg = require('fast-glob');

async function getScores(ids) {
    const scores = []
    for (const id of ids) {
        const record = await fs.readJson(`./state/${id}.json`)
        scores.push(record)
    }
    return scores
}

function stitchPlayerAndScore(team, ratings, winner) {
    let newScores = []
    for (let i = 0; i < team.length; i++) {
        const player = _.omit(team[i], ['history'])
        const games = player.games + 1
        const wins = winner ? player.wins + 1 : player.wins
        const loses = !winner ? player.loses + 1 : player.loses
        const { mu, sigma } = ratings[i]
        const newPlayer = { ...player, mu, sigma, games, wins, loses }
        newPlayer.history = [ _.omit(player, ['name', 'id']), ...team[i].history ]
        newScores.push(newPlayer)
    }
    return newScores
}

async function storeGames(id, winningTeam, losingTeam) {
    const newGame = { winningTeam, losingTeam, date: Date.now() }
    await fs.writeJson(`./state/game-${id}.json`, newGame)
}

async function play(id, winningTeam, losingTeam) {
    await fs.copy('./state', 'backup/state' + Date.now())
    const attendanceOptions = {
        uri: `https://api.meetup.com/<EVENT_NAME>/events/${id}/rsvps?key=<API_KEY>`,
        json: true
    }
    const attendanceResponse = await request(attendanceOptions)
    const players = attendanceResponse.filter(x => x.response === 'yes').map(x => x.member)
    await initNewPlayers(players)
    await storeGames(id, winningTeam, losingTeam)
    const winningScores = await getScores(winningTeam)
    const losingScores = await getScores(losingTeam)
    const [newWinningScores, newLosingScores] = rate([winningScores, losingScores]);
    const winningPlayers = stitchPlayerAndScore(winningScores, newWinningScores, true)
    const losingPlayers = stitchPlayerAndScore(losingScores, newLosingScores, false)
    const newScores = [...winningPlayers, ...losingPlayers]
    await writePlayers(newScores)
}

async function writePlayers(newPlayers) {
    for (const player of newPlayers) {
        await fs.writeJson(`./state/${player.id}.json`, player)
    }
}

async function initNewPlayers (players) {
    console.log('Setting up new players')
    await fs.ensureDir('./state/')
    const newPlayers = []
    for (p of players) {
        const exists = await fs.pathExists(`./state/${p.id}.json`)
        if (!exists) {
            newPlayers.push(p)
        }
    }
    console.log('Setting up', newPlayers)
    const newPlayersSetup = newPlayers.map(i => {
        const { mu, sigma } = new Rating()
        return { mu, sigma, ...i, games: 0, wins: 0, loses: 0, history: []}
    })
    await writePlayers(newPlayersSetup)
    console.log('Finished setting new up')
}

async function leaderboard () {
    const entries = await fg(['*.json', '!game-*.json'], { cwd: 'state' })
    const playerIds = entries.map(i => i.split('.')[0])
    const playerScores = await getScores(playerIds)
    const playerRatings = playerScores.map(i => {
        i.rating = expose({ mu: i.mu, sigma: i.sigma })
        return i
    })
    const sortedPlayers = _.sortBy(playerRatings, 'rating').reverse()
    return sortedPlayers
}

function findMatchingTeam(team, allTeams, howMany) {
    return allTeams.find(x => _.difference(x, team).length === howMany)
}

function removeDups(possibleTeams) {
    const teamsHash = possibleTeams.reduce((a, i) => {
        const [left, right] = i
        if (!(a[left] || a[right])) {
            a[left] = right.join(',')
        }
        return a
    }, {})
    return _.toPairs(teamsHash)
}

async function rateEachMatch(matches) {
    const newMatches = []
    for (m of matches) {
        const teamA = m[0].split(',')        
        const taamAScores = await getScores(teamA)
        const teamANames = taamAScores.map(i => i.name)
        const teamARatings = taamAScores.map(i => {
            return expose({ mu: i.mu, sigma: i.sigma })
        })
        const teamAScore = teamARatings.reduce((a, b) => a + b)
        const teamB = m[1].split(',')
        const teamBScores = await getScores(teamB)   
        const teamBNames = teamBScores.map(i => i.name)    
        const teamBRatings = teamBScores.map(i => {
            return expose({ mu: i.mu, sigma: i.sigma })
        })
        const teamBScore = teamBRatings.reduce((a, b) => a + b)
        const teamDiff = Math.abs(teamAScore - teamBScore)
        newMatches.push({
            teams: [teamANames, teamBNames],
            rating: teamDiff
        })
    }
    return newMatches
}

function bestFiveMatches(matches) {
    const matchesInOrder =  _.sortBy(matches, 'rating')
    return _.take(matchesInOrder, 5)
}

async function pick (playing) {
    const result = [];
    const sum = []
    const howMany = playing.length / 2

    function combine(input, len, start) {
        if(len === 0) {
            const cloneOfResult = _.clone(result)
            sum.push(cloneOfResult)
            return;
        }
        for (var i = start; i <= input.length - len; i++) {
            result[howMany - len] = input[i];
            combine(input, len-1, i+1 );
        }
    }
    combine( playing, howMany, 0);
    const possibleTeams = sum.map(x => [x, findMatchingTeam(x, sum, howMany)])
    const teamsWithoutDups = removeDups(possibleTeams)
    const matchRatings = await rateEachMatch(teamsWithoutDups)
    const bestMatches = bestFiveMatches(matchRatings)
    return bestMatches
}

async function getMeetupPlayers() {
    const eventsOptions = {
        uri: 'https://api.meetup.com/<EVENT_NAME>/events?key=<API_KEY>',
        json: true
    }
    const eventsResponse = await request(eventsOptions)

    const nextEvent = eventsResponse[0]
    const nextEventId = nextEvent.id
    const attendanceOptions = {
        uri: `https://api.meetup.com/<EVENT_NAME>/events/${nextEventId}/rsvps?key=<API_KEY>`,
        json: true
    }
    const attendanceResponse = await request(attendanceOptions)
    const players = attendanceResponse.filter(x => x.response === 'yes').map(x => x.member)
    await initNewPlayers(players)
    const playerIds = players.map(x => x.id)
    const possibleTeams = await pick(playerIds)
    return {
        nextEvent,
        possibleTeams
    }
}

async function getRecentEvents() {
    const eventsOptions = {
        uri: 'https://api.meetup.com/<EVENT_NAME>/events?has_ended=true&desc=true&page=10&status=past&key=<API_KEY>',
        json: true
    }
    return await request(eventsOptions)
}

async function getEvent(id) {
    console.log('id', id)
    const eventsOptions = {
        uri: `https://api.meetup.com/<EVENT_NAME>/events/${id}/attendance?key=<API_KEY>`,
        json: true
    }
    const players = await request(eventsOptions)
    return players.filter(x => x.rsvp.response === 'yes').map(x => x.member)
}

async function getRecord(id) {
    try {
        return await fs.readJson(`./state/game-${id}.json`)
    } catch (err) {
        return undefined
    }
}

module.exports.init = initNewPlayers
module.exports.play = play
module.exports.leaderboard = leaderboard
module.exports.pick = pick
module.exports.meetup = getMeetupPlayers
module.exports.recentevents = getRecentEvents
module.exports.getEvent = getEvent
module.exports.getRecord = getRecord