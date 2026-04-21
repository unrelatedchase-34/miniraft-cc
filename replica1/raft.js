const axios = require("axios");

class RaftNode {
    constructor(id, peers) {
        this.id = id;
        this.peers = peers;

        this.state = "FOLLOWER";
        this.currentTerm = 0;
        this.votedFor = null;
        this.leaderId = null;

        this.log = [];

        this.electionTimeout = null;
        this.heartbeatInterval = null;
    }

    // ---------------- START ----------------
    start() {
        this.resetElectionTimer();
    }

    isLeader() {
        return this.state === "LEADER";
    }

    // ---------------- TIMERS ----------------
    resetElectionTimer() {
        if (this.electionTimeout) clearTimeout(this.electionTimeout);

        const timeout = Math.random() * 300 + 500;

        this.electionTimeout = setTimeout(() => {
            this.startElection();
        }, timeout);
    }

    // ---------------- ELECTION ----------------
    async startElection() {
        this.state = "CANDIDATE";
        this.currentTerm++;
        this.votedFor = this.id;

        let votes = 1;

        console.log(`[${this.id}] Candidate (term ${this.currentTerm})`);

        for (let peer of this.peers) {
            try {
                const res = await axios.post(`${peer}/raft/request-vote`, {
                    term: this.currentTerm,
                    candidateId: this.id
                });

                if (res.data.voteGranted) votes++;
            } catch (e) {}
        }

        if (votes >= 2) {
            this.becomeLeader();
        } else {
            this.state = "FOLLOWER";
            this.resetElectionTimer();
        }
    }

    // ---------------- LEADER ----------------
    becomeLeader() {
        this.state = "LEADER";
        this.leaderId = this.id;

        console.log(`[${this.id}] LEADER`);

        this.startHeartbeat();
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 150);
    }

    async sendHeartbeat() {
        for (let peer of this.peers) {
            try {
                await axios.post(`${peer}/raft/append-entries`, {
                    term: this.currentTerm,
                    leaderId: this.id,
                    entries: []
                });
            } catch (e) {}
        }
    }

    // ---------------- LOG ----------------
    async appendEntry(entry) {
    this.log.push(entry);
    console.log(`[${this.id}] appended entry, replicating...`);
    
    let acks = 1; // count self
    
    for (let peer of this.peers) {
        try {
            await axios.post(`${peer}/raft/append-entries`, {
                term: this.currentTerm,
                leaderId: this.id,
                entries: [entry]
            });
            acks++;
        } catch (e) {}
    }
    
    // committed only if majority confirmed
    if (acks >= 2) {
        console.log(`[${this.id}] entry committed with ${acks} acks`);
        return true;
    } else {
        console.log(`[${this.id}] not enough acks, entry may be lost`);
        return false;
    }
}

    // ---------------- RPC ----------------
    handleRequestVote(data) {
        const { term, candidateId } = data;

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

    handleAppendEntries(data) {
        const { term, leaderId, entries } = data;

        if (term >= this.currentTerm) {
            this.currentTerm = term;
            this.state = "FOLLOWER";
            this.leaderId = leaderId;

            this.resetElectionTimer();

            // append entries (basic)
            if (entries && entries.length > 0) {
                this.log.push(...entries);
            }
        }

        return { success: true };
    }
}

module.exports = { RaftNode };
