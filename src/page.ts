import { Chart } from "chart.js/auto";
import prettyMs from "pretty-ms";
import { InstagramClient } from "./instagram.js";
import type { FollowersHistory, User } from "./models.js";
import { InstagramStorage } from "./storage.js";
import { deduplicateUsers, getById, timestampToStr, truncateMessage } from "./utils.js";

const errorLabel = getById<HTMLElement>('error');
const lastRefreshTimeLabel = getById<HTMLElement>('last-refresh-time');
const usernameLabel = getById<HTMLElement>('username');
const refreshBtn = getById<HTMLButtonElement>('refresh');
const followersCountLabel = getById<HTMLElement>('followers-count');
const followingCountLabel = getById<HTMLElement>('following-count');
const followersChartCanvas = getById<HTMLCanvasElement>('followers-chart');
const followersHistoryList = getById<HTMLElement>('followers-history-list');
const followersAddedLabel = getById<HTMLElement>('followers-added');
const followersRemovedLabel = getById<HTMLElement>('followers-removed');
const filterFollowedBtn = getById<HTMLButtonElement>('filter-followed');
const filterUnfollowedBtn = getById<HTMLButtonElement>('filter-unfollowed');

const changeUserLink = getById<HTMLAnchorElement>('change-user-link');
const usernameChangeContainer = getById<HTMLElement>('username-change-container');
const usernameInput = getById<HTMLInputElement>('username-input');
const saveUsernameBtn = getById<HTMLButtonElement>('save-username');
const cancelUsernameBtn = getById<HTMLButtonElement>('cancel-username');
const clearDataWarning = getById<HTMLElement>('clear-data-warning');

const client = new InstagramClient();
const storage = new InstagramStorage();

let historyFilter: 'all' | 'followed' | 'unfollowed' = 'all';
let historyScrolledOnLoad = false;

function makeHistoryLine(user: User, time: number, action: string, isMutual: boolean): HTMLElement {
    const result = document.createElement('div');
    result.className = `history-entry ${action}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    timeSpan.textContent = new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
    result.appendChild(timeSpan);

    const usernameLink = document.createElement('a') as HTMLAnchorElement;
    usernameLink.className = 'history-username';
    usernameLink.href = `https://www.instagram.com/${user.username}`;
    usernameLink.textContent = `@${user.username}`;
    usernameLink.rel = 'noopener noreferrer';
    usernameLink.target = '_blank';
    result.appendChild(usernameLink);

    const actionSpan = document.createElement('span');
    actionSpan.textContent = ` ${action}`;
    result.appendChild(actionSpan);

    if (isMutual) {
        const followingSpan = document.createElement('span');
        followingSpan.className = 'following-back-indicator';
        followingSpan.textContent = '(mutual)';
        result.appendChild(followingSpan);
    }
    return result;
}

async function renderFollowerHistory(): Promise<void> {
    let history: FollowersHistory[];
    let currentFollowing: User[];
    try {
        history = await storage.getFollowersHistory(1000);
        currentFollowing = await storage.getCurrentFollowing();
    } catch (error) {
        console.error('Failed to render follower history:', error);
        followersHistoryList.innerHTML = '<div class="history-entry">Error loading history</div>';
        return;
    }

    followersHistoryList.innerHTML = '';

    const followingIds = new Set(currentFollowing.map(user => user.id));
    const fragment = document.createDocumentFragment();

    for (const entry of history) {
        if (historyFilter !== 'unfollowed') {
            for (const user of entry.added) {
                fragment.appendChild(makeHistoryLine(user, entry.time, 'followed', followingIds.has(user.id)));
            }
        }
        if (historyFilter !== 'followed') {
            for (const user of entry.removed) {
                fragment.appendChild(makeHistoryLine(user, entry.time, 'unfollowed', followingIds.has(user.id)));
            }
        }
    }

    followersHistoryList.appendChild(fragment);

    if (!historyScrolledOnLoad) {
        const savedPosition = await storage.getHistoryScrollPosition();
        followersHistoryList.scrollTop = savedPosition;
        historyScrolledOnLoad = true;
    }
}

let chartInstance: Chart | null = null;
async function renderFollowersChart() {
    const style = getComputedStyle(followingCountLabel);
    Chart.defaults.font.family = style.fontFamily;
    Chart.defaults.font.size = 11;

    const MAX_DAYS = 30;
    const DAYS_STEP = 5;
    try {
        const history = await storage.getCountsHistory(MAX_DAYS);
        if (history.length === 0) {
            return;
        }

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const followersData = [];
        for (const entry of history) {
            followersData.push({
                x: entry.time,
                y: entry.followersCount,
            });
        }

        const now = Date.now();
        const thirtyDaysAgo = now - MAX_DAYS * 24 * 3600 * 1000;
        chartInstance = new Chart(followersChartCanvas, {
            type: 'line',
            data: {
                datasets: [{ data: followersData, borderColor: '#c671eb' }]
            },
            options: {
                animation: {
                    duration: 0
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                //@ts-expect-error The chart data is untyped
                                const timestamp = context[0].raw.x;
                                return timestampToStr(timestamp);
                            },
                            label: (context) => {
                                //@ts-expect-error The chart data is untyped
                                const value = context.raw.y;
                                return `${value as number} followers`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Followers' }
                    },
                    x: {
                        type: 'linear',
                        min: thirtyDaysAgo,
                        max: now,
                        title: { display: false },
                        ticks: {
                            stepSize: DAYS_STEP * 24 * 3600 * 1000,
                            callback: (value) => new Date(value).toLocaleDateString(undefined, {
                                month: 'short', day: 'numeric'
                            })
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Failed to render followers chart:', error);
    }
}

let fullError: string | null = null;
async function refreshUi() {
    fullError = await storage.getLastError();
    errorLabel.textContent = truncateMessage(fullError, 150);
    usernameLabel.textContent = await storage.getUsername();

    const counts = await storage.getLatestCounts();
    if (counts) {
        followersCountLabel.textContent = counts.followersCount.toString();
        followingCountLabel.textContent = counts.followingCount.toString();

        const deltaTime = Date.now() - counts.time;
        const relativeTime = prettyMs(deltaTime, {
            compact: true,
            verbose: true
        });
        lastRefreshTimeLabel.textContent = relativeTime + ' ago';
        lastRefreshTimeLabel.title = timestampToStr(counts.time);
    } else {
        followersCountLabel.textContent = '?';
        followingCountLabel.textContent = '?';
        lastRefreshTimeLabel.textContent = 'never';
        lastRefreshTimeLabel.title = 'never';
    }

    const delta = await storage.getFollowersDelta(7);
    followersAddedLabel.textContent = `↑${delta.added}`;
    followersRemovedLabel.textContent = `↓${delta.removed}`;

    await renderFollowersChart();

    await renderFollowerHistory();

    updateButtonStates();
}

function getErrorMessage(error: Error): string {
    const messages: string[] = [];
    let curError: Error | unknown = error;
    while (curError instanceof Error) {
        messages.push(curError.message);
        curError = curError.cause;
    }
    return messages.join(': ');
}

errorLabel.addEventListener('click', async () => {
    if (fullError) {
        await navigator.clipboard.writeText(fullError);
        const originalText = errorLabel.textContent;
        errorLabel.textContent = 'Copied to clipboard';
        setTimeout(() => {
            errorLabel.textContent = originalText;
        }, 500);
    }
});

lastRefreshTimeLabel.addEventListener('click', () => {
    const currentText = lastRefreshTimeLabel.textContent;
    const currentTitle = lastRefreshTimeLabel.title;
    lastRefreshTimeLabel.textContent = currentTitle;
    lastRefreshTimeLabel.title = currentText;
});

async function doRefresh() {
    try {
        lastRefreshTimeLabel.textContent = 'in progress...';

        const refreshTime = Date.now();

        let userId: string;
        const customUserId = await storage.getCustomUserId();
        if (customUserId) {
            userId = customUserId;
            console.log(`Using custom user ID: ${userId}`);
        } else {
            userId = await client.getUserId();
            console.log(`Using cookie-based user ID: ${userId}`);
        }

        const username = await client.getUsername(userId);
        await storage.putUsername(username);

        console.log('Fetching followers');
        followersCountLabel.textContent = '0...';
        let followers: User[] = [];
        let maxId = null;
        while (true) {
            const page = await client.getFriendshipPage(userId, 'followers', maxId);
            followers.push(...page.users);
            if (!page.nextMaxId) {
                break;
            }
            followersCountLabel.textContent = followers.length.toString() + '...';
            maxId = page.nextMaxId;
        }
        followers = deduplicateUsers(followers);
        followersCountLabel.textContent = followers.length.toString();
        await storage.putFollowersAndUpdateHistory(followers, refreshTime);

        console.log('Fetching following');
        followingCountLabel.textContent = '0...';
        let following: User[] = [];
        maxId = null;
        while (true) {
            const page = await client.getFriendshipPage(userId, 'following', maxId);
            following.push(...page.users);
            if (!page.nextMaxId) {
                break;
            }
            followingCountLabel.textContent = following.length.toString() + '...';
            maxId = page.nextMaxId;
        }
        following = deduplicateUsers(following);
        followingCountLabel.textContent = following.length.toString();

        await storage.putFollowing(following);

        await storage.putCounts({
            time: refreshTime,
            followersCount: followers.length,
            followingCount: following.length
        });
        await storage.putLastError('');
    } catch (error) {
        if (error instanceof Error) {
            await storage.putLastError(getErrorMessage(error));
        } else {
            console.error('Got strange error', error);
            await storage.putLastError(`Unknown error: ${error}`);
        }
    }
}

refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    await doRefresh();
    await refreshUi();
    refreshBtn.disabled = false;
});

function updateButtonStates() {
    filterFollowedBtn.classList.toggle('active', historyFilter !== 'unfollowed');
    filterUnfollowedBtn.classList.toggle('active', historyFilter !== 'followed');
}

filterFollowedBtn.addEventListener('click', async () => {
    historyFilter = (historyFilter === 'unfollowed') ? 'all' : 'unfollowed';
    updateButtonStates();
    await renderFollowerHistory();
});

filterUnfollowedBtn.addEventListener('click', async () => {
    historyFilter = (historyFilter === 'followed') ? 'all' : 'followed';
    updateButtonStates();
    await renderFollowerHistory();
});

window.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
        await storage.putHistoryScrollPosition(followersHistoryList.scrollTop);
    }
});

async function showUsernameChangeContainer() {
    usernameChangeContainer.style.display = 'block';
    usernameInput.value = '';
    usernameInput.focus();

    const hasData = await storage.hasStoredData();
    if (hasData) {
        clearDataWarning.style.display = 'block';
    } else {
        clearDataWarning.style.display = 'none';
    }
}

function hideUsernameChangeContainer() {
    usernameChangeContainer.style.display = 'none';
}

async function showUsernameError(message: string) {
    await storage.putLastError(message);
    errorLabel.textContent = message;
}

// Validate Instagram username format
async function validateUsername(username: string): Promise<boolean> {
    if (!username || username.trim() === '') {
        await showUsernameError('Username cannot be empty');
        return false;
    }

    return true;
}

// Change user link click handler - toggle visibility
changeUserLink.addEventListener('click', async () => {
    if (usernameChangeContainer.style.display === 'none') {
        await showUsernameChangeContainer();
    } else {
        hideUsernameChangeContainer();
    }
});

// Cancel button click handler
cancelUsernameBtn.addEventListener('click', () => {
    hideUsernameChangeContainer();
});

saveUsernameBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!(await validateUsername(username))) {
        return;
    }

    saveUsernameBtn.disabled = true;
    try {
        const userId = await client.getUserIdFromUsername(username);
        await storage.clearAllData();
        await storage.putCustomUserId(userId);
        await storage.putUsername(username);
        hideUsernameChangeContainer();
        await refreshUi();
    } catch (error) {
        if (error instanceof Error) {
            await showUsernameError(error.message);
        } else {
            await showUsernameError(`Unknown error: ${error}`);
        }
    } finally {
        saveUsernameBtn.disabled = false;
    }
});

// Handle Enter key in username input
usernameInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        saveUsernameBtn.click();
    }
});

async function onLoad() {
    const customUserId = await storage.getCustomUserId();
    if (customUserId) {
        console.log(`Using custom user ID ${customUserId}, no need to refresh the username right now`);
    } else {
        // If we do not have custom user ID, we must use the user id from cookies. Check if we need to resolve it to
        // username first (i.e. we are opening the page for the first time). We have a custom user ID, just refresh the
        // UI.
        const storedUsername = await storage.getUsername();
        if (!storedUsername) {
            try {
                const userId = await client.getUserId();
                console.log(`Using cookie-based user ID: ${userId}, resolving to username`);
                const username = await client.getUsername(userId);
                console.log(`Resolved username ${username}`);
                await storage.putUsername(username);
            } catch (error) {
                if (error instanceof Error) {
                    await storage.putLastError(getErrorMessage(error));
                } else {
                    await storage.putLastError(`Unknown error: ${error}`);
                }
            }
        }
    }
    await refreshUi();
}

await onLoad();
