const numChans = 6;
const cacheUrl = "https://6n2b4yjwl3y4ztk24wppxfrkvm0zrqtv.lambda-url.eu-west-2.on.aws/";

const xlationStatus = Array(numChans).fill({
    "pc": {},
    "offer" : {},
    "answer" : {},
    "available" : true,
    "tx" : false,
    "client" : 0
 });

window.onload = function () {

    // Attach the event listener to the squares and mic symbols
    let txObjs = document.getElementsByClassName("txIconDiv");
    attachEventListeners(txObjs);
    let rxObjs = document.getElementsByClassName("channelGridTd");
    attachEventListeners(rxObjs);

}

function errHandler(err) {
    console.log(err);
}

function attachEventListeners(objs) {
    Array.prototype.forEach.call(objs, function (obj) {
        obj.addEventListener("click", function(e) {
            let id = this.id.substring(0,2);
            let chan = this.id.substring(2);
            clickEvent(id, chan, e);
        });
    });
}

function clickEvent(id, chan, e) {
    if (id == "tx") {
        e.stopPropagation();
        tx(chan);
    }
    rx(chan);
}

async function fetch_json(url) {
    try {
        const response = await fetch(url, {method: 'GET', headers: {'Accept': 'application/json'}});
        if (response.ok) {
            return(await response.json());
        } else {
            throw {
                json: await response.json(),
                status: response.status,
                statusText: response.statusText
            };
        }
    } catch (e) {
        if (e.json){
            console.error(JSON.stringify(e.json));
        } else {
            console.error("Request err:" + e);
        }
    }
}

async function fetch_status(chan) {
    const statUrl = cacheUrl + "?status&chan=" + chan;
    const xlationStatus = await fetch_json(statUrl);
    // Take no action if status not found
    if (!xlationStatus || (xlationStatus.status && xlationStatus.status == "MISS")) {
        return;
    }


}

function tx(chan) {
    fetch_status(chan);
    return;
    if (xlationStatus[chan].available) {
        let pc = new RTCPeerConnection({});
        xlationStatus[chan].pc = pc;
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
            pc.addStream(stream);
        }).catch(errHandler);
        pc.onconnection = function(e) {
            console.log('onconnection ', e);
        }
        pc.createOffer().then(des => {
            console.log('createOffer ok ');
            pc.setLocalDescription(des).then(() => {
                setTimeout(function() {
                    if (pc.iceGatheringState == "complete") {
                        return;
                    } else {
                        console.log('after GetherTimeout');
                        xlationStatus[chan].offer = JSON.stringify(pc.localDescription);
                    }
                }, 2000);
                console.log('setLocalDescription ok');
            }).catch(errHandler);
        }).catch(errHandler);
    }

}

function rx(chan) {

}
