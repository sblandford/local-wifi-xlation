const gNumChans = 6;
const gCacheUrl = "https://6n2b4yjwl3y4ztk24wppxfrkvm0zrqtv.lambda-url.eu-west-2.on.aws/";
// Generate a random UUID for status locking
const gUuid = uuidv4();
const gStatusAttempts = 10;
let gStatusCounter = gStatusAttempts;
const gStatusAttemptDelayMs = 1000;
const gMaxClients = 20;

const xlationClient = Array(gNumChans).fill({
    "rxpc": {},
    "txpc": {},
    "offer": Array(gMaxClients).fill({}),
    "answer": {}
});

const xlationStatus = Array(gNumChans).fill({
    "available" : Array(),
    "consumed" : Array(),
    "tx" : false,
    "clients" : 0
 });

const localXlationStatus = Array(gNumChans);

window.onload = function () {

    // Attach the event listener to the squares and mic symbols
    let txObjs = document.getElementsByClassName("txIconDiv");
    attachEventListeners(txObjs);
    let rxObjs = document.getElementsByClassName("channelGridTd");
    attachEventListeners(rxObjs);

    
    // TEST Ensure initial conditions
    for (let chan = 0; chan < gNumChans; chan++) {
        push_status(chan);
    }
    
}

function errHandler(err) {
    console.log(err);
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function attachEventListeners(objs) {
    Array.prototype.forEach.call(objs, function (obj) {
        obj.addEventListener("click", function(e) {
            let id = this.id.substring(0,2);
            let chan = parseInt(this.id.substring(2)) - 1;
            clickEvent(id, chan, e);
        });
    });
}

function clickEvent(id, chan, e) {
    if (id === "tx") {
        e.stopPropagation();
        tx(chan);
    }
    rx(chan);
}

async function fetch_json(url) {
    try {
        const response = await fetch(url,
            {
                method: 'GET',
                headers: {'Accept': 'application/json'},
                cache: "no-cache"
            });
        if (response.ok) {
            const json = await response.json();
            return(json);
        } else {
            throw {
                json: await response.json(),
                status: response.status,
                statusText: response.statusText
            }
        }
    } catch (e) {
        if (e.json) {
            console.error(JSON.stringify(e.json));
        } else {
            console.error('Error reported from server : ', e);
        }
    }
}
async function push_json(url, data) {
    try {
        const response = await fetch(url,
            {
                method: 'POST',
                headers: {'Accept': 'application/json'},
                cache: "no-cache",
                body: JSON.stringify(data)
            });
        if (response.ok) {
            return(await response.json());
        } else {
            throw {
                json: await response.json(),
                status: response.status,
                statusText: response.statusText
            }
        }
    } catch (e) {
        if (e.json){
            console.error(JSON.stringify(e.json));
        } else {
            console.error('Error reported from server : ', e);
        }
    }
}

async function push_sdp(chan, client, direction, sdp) {
    const statUrl = gCacheUrl + "?chan=" + chan + "&client=" + client + "&direction=" + direction;
    const newXlationStatus = await push_json(statUrl, btoa(JSON.stringify(sdp)));
    if (!newXlationStatus || !newXlationStatus.status) {
        throw new Error('Expected status not found');
    }
    if (newXlationStatus.status !== "OK") {
        console.warn("Unable to push SDP for channel:", chan, ", client :", client, ", direction:", direction);
    }
}

async function fetch_status(chan) {
    const statUrl = gCacheUrl + "?status&chan=" + chan + "&lock=" + gUuid;
    // const ipv4 = await fetch_json('http://nginxaws.bkwsu.eu/videojs/php/ip.php');
    // console.log(ipv4);
    const newXlationStatus = await fetch_json(statUrl);
    if (!newXlationStatus || !newXlationStatus.status) {
        throw new Error('Expected status not found');
    }
    // Take no action if status not found. Looks like we are the first so we can just write the status.
    if (newXlationStatus.status === "MISS") {
        console.log('No cached status, creating from new');
        return;
    }
    // If locked then retry
    if (newXlationStatus.status === "LOCKED") {
        if (gStatusCounter-- > 0) {
            await timeout(gStatusAttemptDelayMs);
            console.log('Fetch status locked, retrying');
            await fetch_status(chan);
        } else {
            throw new Error('Fetch lock timed out after ' + gStatusAttempts + ' attempts');
        }
    } else {
        gStatusCounter = gStatusAttempts;
        xlationStatus[chan] = JSON.parse(atob(newXlationStatus.message));
    }
}


async function push_status(chan) {
    const statUrl = gCacheUrl + "?status&chan=" + chan + "&lock=" + gUuid;
    const newXlationStatus = await push_json(statUrl, btoa(JSON.stringify(xlationStatus[chan])));
    if (!newXlationStatus || !newXlationStatus.status) {
        throw new Error('Expect status not found');
    }
    // If locked then retry
    if (newXlationStatus.status === "LOCKED") {
        if (gStatusCounter-- > 0) {
            await timeout(gStatusAttemptDelayMs);
            console.log('Push status locked, retrying');
            await push_status(chan);
        } else {
            throw new Error('Push lock timed out after ' + gStatusAttempts + ' attempts');
        }
    } else {
        gStatusCounter = gStatusAttempts;
    }
}

async function tx(chan, client = 0) {
    if (client == 0) {
        console.log('Fetching status');
        await fetch_status(chan);
    }
    if (!xlationStatus[chan].tx) {
        
        let pc = new RTCPeerConnection({});
        xlationClient[chan].txpc = pc;
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
            pc.addStream(stream);
        }).catch(errHandler);
        pc.onconnection = function(e) {
            console.log('onconnection ', e);
        }
        pc.createOffer().then(des => {
            console.log('createOffer ok ');
            pc.setLocalDescription(des).then(() => {
                setTimeout(async function() {
                    if (pc.iceGatheringState === "complete") {
                        console.log('Complete');
                        return;
                    } else {

                        await push_sdp(chan, client, "offer", pc.localDescription);
                        xlationStatus[chan].available.push(client);
                        xlationClient[chan][client] = pc;
                        if (client < (gMaxClients - 1)) {
                            await tx(chan, ++client);
                        } else {
                            console.log('Writing status');
                            xlationStatus[chan].tx = true;
                            await push_status(chan);
                        }
                    }
                }, 200);
                console.log('setLocalDescription ok');
            }).catch(errHandler);
        }).catch(errHandler);
    }
}

function rx(chan) {

}
