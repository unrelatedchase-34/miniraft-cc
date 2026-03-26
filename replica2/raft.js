 const axios = require("axios");

class RaftNode {
    constructor(id, peers) {
        this.id = id;
        this.peers = peers; // other replica URLs

        // RAFT STATE
        this.state = "FOLLOWER";
        this.currentTerm = 0;
        this.votedFor = null;
        this.leaderId = null;

        // TIMERS
        this.electionTimeout = null;
        this.heartbeatInterval = null;

        this.resetElectionTimer();
    }

    // -------------------- TIMER --------------------
    resetElectionTimer() {
        if (this.electionTimeout) clearTimeout(this.electionTimeout);

        const timeout = Math.random() * 300 + 500; // 500–800ms

        this.electionTimeout = setTimeout(() => {
            this.startElection();
        }, timeout);
    }

    // -------------------- ELECTION --------------------
    async startElection() {
        this.state = "CANDIDATE";
        this.currentTerm++;
        this.votedFor = this.id;

        let votes = 1;

        console.log(`[${this.id}] became CANDIDATE (term ${this.currentTerm})`);

        for (let peer of this.peers) {
            try {
                const res = await axios.post(`${peer}/request-vote`, {
                    term: this.currentTerm,
                    candidateId: this.id
                });

                if (res.data.voteGranted) {
                    votes++;
                }
            } catch (err) {}
        }

        if (votes >= 2) {
            this.becomeLeader();
        } else {
            this.state = "FOLLOWER";
            this.resetElectionTimer();
        }
    }

    // -------------------- LEADER --------------------
    becomeLeader() {
        this.state = "LEADER";
        this.leaderId = this.id;

        console.log(`[${this.id}] became LEADER`);

        this.startHeartbeat();
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 150); // 150ms
    }

    async sendHeartbeat() {
        for (let peer of this.peers) {
            try {
                await axios.post(`${peer}/heartbeat`, {
                    term: this.currentTerm,
                    leaderId: this.id
                });
            } catch (err) {}
        }
    }

    // -------------------- RPC HANDLERS --------------------

    async handleRequestVote(req) {
        const { term, candidateId } = req.body;

        if (term > this.currentTerm) {
            this.currentTerm = term;
            this.state = "FOLLOWER";
            this.votedFor = null;
        }

        let voteGranted = false;

        if (
            term === this.currentTerm &&
            (this.votedFor === null || this.votedFor === candidateId)
        ) {
            voteGranted = true;
            this.votedFor = candidateId;
            this.resetElectionTimer();
        }

        return { voteGranted };
    }

    async handleHeartbeat(req) {
        const { term, leaderId } = req.body;

        if (term >= this.currentTerm) {
            this.currentTerm = term;
            this.state = "FOLLOWER";
            this.leaderId = leaderId;

            this.resetElectionTimer();
        }

        return { success: true };
    }
}

module.exports = RaftNode;
