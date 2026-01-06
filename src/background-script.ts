browser.browserAction.onClicked.addListener(() => {
    browser.tabs.create({ url: 'page.html', active: true });
});
