import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import Select from 'react-select';
import _ from 'lodash'
import Board from 'react-trello'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import "react-tabs/style/react-tabs.css";

async function pickTeamsForNextEvent() {
  const response = await fetch('/api/teams');
  const body = await response.json();
  return body;
};

async function getEvents() {
  const response = await fetch('/api/recent');
  const body = await response.json();
  return body;
};

async function getEvent(id) {
  const response = await fetch('/api/event/' + id);
  const body = await response.json();
  return body;
};

async function getLeaderboard() {
  const response = await fetch('/api/leaderboard');
  const body = await response.json();
  return body;
};

class App extends Component {
  state = {
    possibleTeams: [],
    nextEvent: {},
    post: '',
    responseToPost: '',
    selectedOption: null,
    events: [],
    eventPlayers: [],
    winners: [],
    losers: [],
    record: undefined,
    isDouble: false,
    leaderboard: []
  };
  async componentDidMount() {
    const next = await pickTeamsForNextEvent()
    const events = await getEvents()
    const leaderboard = await getLeaderboard()
    const eventOptions = events.map(e => ({ value: e.id, label: `${e.name} - ${e.local_date}, ${e.local_time}` }))
    this.setState({ possibleTeams: next.possibleTeams, nextEvent: next.nextEvent, events: eventOptions, leaderboard })
  }
  handleSubmit = async e => {
    e.preventDefault();
    await fetch('/api/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: this.state.selectedOption.value, winners: this.state.winners, losers: this.state.losers }),
    });

    if (this.state.isDouble) {
      await fetch('/api/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: this.state.selectedOption.value, winners: this.state.winners, losers: this.state.losers }),
      });
    }
    window.alert('Saved')
  };

  handleChange = async selectedOption => {
    console.log(`Option selected:`, selectedOption);
    const evt = await getEvent(selectedOption.value)
    const eventPlayers = evt.eventPlayers
    const record = evt.record
    this.setState({ selectedOption, eventPlayers, record });
  }

  onDataChange = data => {
    const winners = data.lanes[0].cards.map(i => i.id)
    const losers = data.lanes[1].cards.map(i => i.id)
    this.state.winners = winners
    this.state.losers = losers
  }

  handleInputChange = (event) => {
    const target = event.target;
    const value = target.checked;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  render() {
    const { possibleTeams, nextEvent, selectedOption, events, eventPlayers, record, leaderboard } = this.state
    const leaderboardWithGames = leaderboard.filter(x => x.games > 0)
    let [teamA, teamB] = _.chunk(eventPlayers, eventPlayers.length / 2)
    if (record) {
      teamA = eventPlayers.filter(x => _.includes(record.winningTeam, x.id.toString()))
      teamB = eventPlayers.filter(x => _.includes(record.losingTeam, x.id.toString()))
    }
    const winningCards = teamA && teamA.length ? teamA.map(a => ({ id: a.id.toString(), title: a.name })) : []
    const losingCards = teamB && teamB.length ? teamB.map(a => ({ id: a.id.toString(), title: a.name })) : []
    const data = {
      lanes: [
        {
          id: 'winning',
          title: 'Winning',
          label: '',
          cards: winningCards
        },
        {
          id: 'losing',
          title: 'Losing',
          label: '',
          cards: losingCards
        }
      ]
    }
    const boardStyle = { width: '600px',height: '500px' }
    if (record) {
      boardStyle['background-color'] = '#4BBF6B'
    }
    return (
      <div className="App">
        <Tabs>
          <TabList>
            <Tab>Upcoming</Tab>
            <Tab>Record</Tab>
            <Tab>Leaderboard</Tab>
          </TabList>
          <TabPanel>
            <h1>Teams { nextEvent.name } { nextEvent.time ? new Date(nextEvent.time).toUTCString() : '' }</h1>
            <ol>
              {possibleTeams.map(t => <li><p>{t.teams[0].join(', ')}</p> <p>{t.teams[1].join(', ')}</p> Rating. { t.rating } </li>)}
            </ol>
          </TabPanel>
          <TabPanel>
            <Select
              value={selectedOption}
              onChange={this.handleChange}
              options={events}
            />
            <form onSubmit={this.handleSubmit}>
              <h1>Teams { record ? 'Recorded' : '' }</h1>
              <Board data={data} draggable={ record ? false : true } onDataChange={this.onDataChange} style={boardStyle} />
              <label>
              Double:
              <input
                name="isDouble"
                type="checkbox"
                checked={this.state.isDouble}
                onChange={this.handleInputChange} />
              </label>
              { record ? '' : <button type="submit">Save</button> }
            </form>
          </TabPanel>
          <TabPanel>
            <ol>
            {leaderboardWithGames.map(l => <li>{l.name} - {l.rating} (Games: {l.games}, Wins: {l.wins}, Loses: {l.loses})</li>)}
            </ol>
          </TabPanel>
        </Tabs>
      </div>
    );
  }
}

export default App;
