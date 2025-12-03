/** @type {number} */
let interval;
self.addEventListener('message', function(event) {
    if (event.data === 'readStart') {
        interval = setInterval(() => {
            self.postMessage('read');
        }, 100);
    } else if (event.data === 'readStop') {
        clearInterval(interval);
    }
}, false);
