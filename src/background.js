// header
chrome.webRequest.onHeadersReceived.addListener(function (details) {
}, {urls: ["*://ycdn.ync.ac.kr/*"]}, ['responseHeaders', 'extraHeaders', 'blocking']);
chrome.webRequest.onBeforeSendHeaders.addListener(function (details) {
    console.log('headers..');
    console.log(details);
    const requestHeaders = details.requestHeaders;
    // requestHeaders.push({name: 'Accept', value: '*/*'});
    // requestHeaders.push({name: 'Accept-Encoding', value: 'identity;q=1, *;q=0'});
    // requestHeaders.push({name: 'Accept-Language', value: 'ko,en;q=0.9,en-US;q=0.8'});
    // requestHeaders.push({name: 'Cache-Control', value: 'no-cache'});
    // requestHeaders.push({name: 'Connection', value: 'keep-alive'});
    // requestHeaders.push({name: 'Host', value: 'ycdn.ync.ac.kr'});
    // requestHeaders.push({name: 'Pragma', value: 'no-cache'});
    // requestHeaders.push({name: 'Range', value: 'bytes=0-'});
    requestHeaders.push({
        name: 'referer',
        value: details.url
    });
    // requestHeaders.push({name: 'Sec-Fetch-Dest', value: 'video'});
    // requestHeaders.push({name: 'Sec-Fetch-Mode', value: 'no-cors'});
    // requestHeaders.push({name: 'Sec-Fetch-Site', value: 'same-site'});
    // requestHeaders.push({
    //     name: 'User-Agent',
    //     value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36 Edg/85.0.564.63'
    // });
    return {requestHeaders: requestHeaders};
}, {urls: ["*://ycdn.ync.ac.kr/*"]}, ['requestHeaders', 'blocking', 'extraHeaders']);
//body
chrome.webRequest.onBeforeRequest.addListener(function (details) {
    console.log(details);
    details.type = 'media';
    details.initiator = 'https://ycdn.ync.ac.kr';
    return {initiator: details.initiator, type: details.type};
}, {urls: ["*://ycdn.ync.ac.kr/*"]}, ["requestBody"]);