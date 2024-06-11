
window.onload = function () {

    // Attach the event listener to the squares and mic symbols
    let txObjs = document.getElementsByClassName("txIconDiv");
    attachEventListeners(txObjs);
    let rxObjs = document.getElementsByClassName("channelGridTd");
    attachEventListeners(rxObjs);

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
    }
    console.log("Function : " + id + ", chan : " + chan)
}
