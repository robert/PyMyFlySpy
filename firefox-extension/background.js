const browser = window.browser;

// Define targets as objects with hostname and optional path patterns
const TARGETS = [
    { hostname: "www.cogsci.ed.ac.uk", paths: ["/~ht/testxhr2.txt"] },
];

// API endpoint configuration
const API_CONFIG = {
    baseUrl: 'http://127.0.0.1:1337',
    recordEndpoint: '/record'
};

// Generate URL patterns for each target
const URL_PATTERNS = TARGETS.flatMap(target => {
    if (!target.paths || target.paths.length === 0) {
        return [`*://*.${target.hostname}/*`];
    }
    return target.paths.map(path => `*://*.${target.hostname}${path}`);
});

// Format captured data for the API
function formatDataForApi(capturedData) {
    return {
        raw: capturedData,
        timestamp: Date.now(),
    };
}

// Send data to the API
async function sendToApi(data) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.recordEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ "content": data })
        });

        if (!response.ok) {
            throw new Error(`API response error: ${response.status}`);
        }

        const result = await response.json();
        console.log('API response:', result);
        return result;
    } catch (error) {
        console.error('Error sending data to API:', error);
        throw error;
    }
}

// Set up filter in onBeforeRequest
browser.webRequest.onBeforeRequest.addListener(
    (details) => {
        console.log(`Processing request: ${details.requestId}`);
        try {
            const filter = browser.webRequest.filterResponseData(details.requestId);
            let responseText = '';

            filter.ondata = event => {
                filter.write(event.data);
                const decoder = new TextDecoder();
                responseText += decoder.decode(event.data, { stream: true });
            };

            filter.onstop = async () => {
                const decoder = new TextDecoder();
                responseText += decoder.decode();

                // Format and send data to API
                const formattedData = formatDataForApi(responseText, details);
                try {
                    await sendToApi(formattedData);
                    console.log(`Successfully sent data for ${details.url} to API`);
                } catch (error) {
                    console.error(`Failed to send data for ${details.url} to API:`, error);
                }

                filter.disconnect();
            };

            filter.onerror = (error) => {
                console.error(`Filter error for ${details.url}:`, error);
                filter.disconnect();
            };
        } catch (e) {
            console.error('Error setting up filter:', e);
        }
    },
    { urls: URL_PATTERNS },
    ['blocking']
);

// Log initialization
console.log("Firefox Network Logger initialized with configuration:", {
    targets: TARGETS.map(target => ({
        hostname: target.hostname,
        paths: target.paths || ['*'],
        patterns: target.paths ?
            target.paths.map(path => `*://*.${target.hostname}${path}`) :
            [`*://*.${target.hostname}/*`]
    })),
    apiConfig: API_CONFIG
});