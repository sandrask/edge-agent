/*
Copyright SecureKey Technologies Inc. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/

import axios from 'axios';
import {POST_STATE, waitForEvent} from "../../../../events";
import {Messenger} from "..";

var uuid = require('uuid/v4')

const routerCreateInvitationPath = `/didcomm/invitation`
const stateCompleted = 'completed'
const topicDidExchangeStates = 'didexchange_states'
const createConnReqType = 'https://trustbloc.github.io/blinded-routing/1.0/create-conn-req'
const createConnResTopic = 'create-conn-resp'

/**
 * AgentMediator provides aries mediator features
 * @param aries agent instance
 * @class
 */
export class AgentMediator {
    constructor(aries) {
        this.aries = aries
        this.messenger = new Messenger(aries)
    }

    async connect(endpoint) {
        let invitation = await createInvitationFromRouter(endpoint)
        let conn = await this.aries.outofband.acceptInvitation({
            my_label: 'agent-default-label',
            invitation: invitation,
        })

        let connID = conn['connection_id']

        await waitForEvent(this.aries, {
            type: POST_STATE,
            stateID: stateCompleted,
            connectionID: connID,
            topic: topicDidExchangeStates,
        })


        const retries = 10;
        for (let i = 1; i <= retries; i++) {
            try {
                await this.aries.mediator.register({connectionID: connID})
            } catch (e) {
                if (!e.message.includes("timeout waiting for grant from the router") || i === retries) {
                    throw e
                }
                await sleep(500);
                continue
            }
            break
        }

        let res = await this.aries.mediator.getConnections()

        if (res.connections.includes(connID)) {
            console.log("router registered successfully!", connID)
        } else {
            console.log("router was not registered!", connID)
        }

        // return handle for disconnect
        return () => this.aries.mediator.unregister({connectionID: connID})
    }

    async reconnect() {
        try {
            let res = await this.aries.mediator.getConnections()
            for (const connection of res.connections) {
                await this.aries.mediator.reconnect({connectionID: connection})
            }
        } catch (e) {
            console.error('unable to reconnect to router', e)
        }
    }

    async isAlreadyConnected() {
        let res
        try {
            res = await this.aries.mediator.getConnections()
        } catch (e) {
            throw e
        }

        return res.connections && res.connections.length > 0
    }

    async createInvitation() {
        // creates invitation through the out-of-band protocol
        let response = await this.aries.outofband.createInvitation({
            label: 'agent-label',
            router_connection_id: await getMediatorConnections(this.aries, true)
        })

        return response.invitation
    }

    async requestDID(reqDoc) {
        let connection = await getMediatorConnections(this.aries, true)
        if (!connection) {
            console.error('failed to send connection request to router, no connection found!')
            throw 'could not find connection with router'
        }

        let response = await this.messenger.sendAndWaitForReply(connection, {
            "@id": uuid(),
            "@type": createConnReqType,
            data: {thirdPartyDIDDoc: reqDoc},
            "sent_time": new Date().toJSON(),
            "~purpose": ["create-conn-req"],
        }, createConnResTopic)


        // TODO currently getting routerDIDDoc as byte[], to be fixed
        if (response.data.routerDIDDoc && response.data.routerDIDDoc.length > 0) {
            return JSON.parse(String.fromCharCode.apply(String, response.data.routerDIDDoc))
        }

        console.error('failed to request DID from router, failed to get connection response')
        throw 'failed to request DID from router, failed to get connection response'
    }
}

export async function getMediatorConnections(agent, single) {
    let resp = await agent.mediator.getConnections()
    if (!resp.connections || resp.connections.length === 0) {
        return ""
    }

    if (single) {
        return resp.connections[Math.floor(Math.random() * resp.connections.length)]
    }

    return resp.connections.join(",");
}

const createInvitationFromRouter = async (endpoint) => {
    const response = await axios.get(`${endpoint}${routerCreateInvitationPath}`)
    return response.data.invitation
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}