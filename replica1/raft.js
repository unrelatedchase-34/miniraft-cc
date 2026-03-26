// Core RAFT logic — owned by Ishanvee
// This is a working stub so the system runs end-to-end

const axios = require('axios');

class RaftNode {
  constructor(nodeId, peers) {
    this.nodeId = nodeId;
    this.peers = peers;
    this.state = 'follower';
    this.currentTerm = 0;
    this.votedFor = null;
    this.leaderId = null;
    this.log = [];
    this.electionTimeout = null;
    this.heartbeatInterval = null;
  }

  start() {
    this.resetElectionTimeout();
  }

  isLeader() {
    return this.state === 'leader';
  }

  resetElectionTimeout() {
    clearTimeout(this.electionTimeout);
    const timeout = 1500 + Math.random() * 1500;
    this.electionTimeout = setTimeout(() => this.startElection(), timeout);
  }

  async startElection() {
    this.state = 'candidate';
    this.currentTerm++;
    this.votedFor = this.nodeId;
    let votes = 1;
    console.log(`${this.nodeId} starting election for term ${this.currentTerm}`);

    for (const peer of this.peers) {
      try {
        const res = await axios.post(`${peer}/raft/request-vote`, {
          term: this.currentTerm,
          candidateId: this.nodeId
        });
        if (res.data.voteGranted) votes++;
      } catch (e) {}
    }

    if (votes > (this.peers.length + 1) / 2) {
      this.becomeLeader();
    } else {
      this.state = 'follower';
      this.resetElectionTimeout();
    }
  }

  becomeLeader() {
    this.state = 'leader';
    this.leaderId = this.nodeId;
    console.log(`${this.nodeId} became leader for term ${this.currentTerm}`);
    this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), 500);
  }

  async sendHeartbeats() {
    for (const peer of this.peers) {
      try {
        await axios.post(`${peer}/raft/append-entries`, {
          term: this.currentTerm,
          leaderId: this.nodeId,
          entries: []
        });
      } catch (e) {}
    }
  }

  appendEntry(stroke) {
    this.log.push(stroke);
    for (const peer of this.peers) {
      axios.post(`${peer}/raft/append-entries`, {
        term: this.currentTerm,
        leaderId: this.nodeId,
        entries: [stroke]
      }).catch(() => {});
    }
  }

  handleAppendEntries({ term, leaderId, entries }) {
    if (term >= this.currentTerm) {
      this.currentTerm = term;
      this.state = 'follower';
      this.leaderId = leaderId;
      clearInterval(this.heartbeatInterval);
      this.resetElectionTimeout();
      if (entries.length > 0) this.log.push(...entries);
    }
    return { success: true, term: this.currentTerm };
  }

  handleRequestVote({ term, candidateId }) {
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.state = 'follower';
      this.votedFor = candidateId;
      return { voteGranted: true, term: this.currentTerm };
    }
    const canVote = !this.votedFor || this.votedFor === candidateId;
    if (term === this.currentTerm && canVote) {
      this.votedFor = candidateId;
      return { voteGranted: true, term: this.currentTerm };
    }
    return { voteGranted: false, term: this.currentTerm };
  }
}

module.exports = { RaftNode };
