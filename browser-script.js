(function() {
    window.requestMap = new Map();
    
    const logRequest = (url, response, type, status) => {
        const urlWithoutParams = url.split('?')[0];
        window.requestMap.set(urlWithoutParams, {
            url: url,
            response: response,
            type: type,
            status: status,
            timestamp: new Date().toISOString()
        });
    };

    // Override XMLHttpRequest
    const XHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new XHR();
        const open = xhr.open;
        const send = xhr.send;
        
        xhr.open = function() {
            this._url = arguments[1];
            return open.apply(this, arguments);
        };
        
        xhr.send = function() {
            this.addEventListener('load', function() {
                try {
                    const response = JSON.parse(this.responseText);
                    logRequest(this._url, response, 'XHR', this.status);
                } catch (e) {
                    logRequest(this._url, this.responseText, 'XHR', this.status);
                }
            });
            return send.apply(this, arguments);
        };
        
        return xhr;
    };

    // Override Fetch
    const originalFetch = window.fetch;
    window.fetch = async function() {
        const url = arguments[0];
        try {
            const response = await originalFetch.apply(this, arguments);
            
            // Clone response for logging
            const responseForLogging = response.clone();
            
            // Try to get response data
            responseForLogging.text().then(text => {
                try {
                    // Try to parse as JSON first
                    const data = JSON.parse(text);
                    logRequest(url, data, 'Fetch', response.status);
                } catch {
                    // If not JSON, store as text
                    logRequest(url, text, 'Fetch', response.status);
                }
            }).catch(error => {
                logRequest(url, `Error reading response: ${error.message}`, 'Fetch', response.status);
            });
            
            // Return original response
            return response;
        } catch (error) {
            console.error('Fetch Error:', error);
            throw error;
        }
    };

    // Return all requests as a plain object
    window.getAllRequests = () => {
        const result = {};
        for (const [url, data] of window.requestMap.entries()) {
            try {
                // Ensure the data is serializable
                result[url] = {
                    url: data.url,
                    response: data.response,
                    type: data.type,
                    status: data.status,
                    timestamp: data.timestamp
                };
            } catch (error) {
                result[url] = {
                    url: data.url,
                    response: 'Error: Could not serialize response',
                    type: data.type,
                    status: data.status,
                    timestamp: data.timestamp
                };
            }
        }
        return result;
    };

    console.log('Request Logger Initialized! Use getAllRequests() to get the data');
})();