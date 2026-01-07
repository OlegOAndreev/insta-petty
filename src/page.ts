import { Chart } from "chart.js/auto";
import prettyMs from "pretty-ms";
import { getFriendshipPage, getUserId, getUsername } from "./instagram.js";
import type { FollowersHistory, User } from "./models.js";
import {
    getCountsHistory,
    getCurrentFollowing,
    getFollowersDelta,
    getFollowersHistory,
    getHistoryScrollPosition,
    getLastError,
    getLatestCounts,
    getStoredUsername,
    storeCounts,
    storeFollowersAndUpdateHistory,
    storeFollowing,
    storeHistoryScrollPosition,
    storeLastError,
    storeUsername
} from "./storage.js";

function getById<T extends HTMLElement>(elementId: string): T {
    const element = document.getElementById(elementId);
    if (!element) {
        throw new Error(`Element with id "${elementId}" not found`);
    }
    return element as T;
}

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

function truncateMessage(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
        return str;
    }
    return str.substring(0, maxLength) + '...';
}

function timestampToStr(time: number): string {
    const date = new Date(time);
    const dateStr = date.toLocaleDateString(undefined, { dateStyle: 'medium' });
    const timeStr = date.toLocaleTimeString(undefined, { timeStyle: 'short', hourCycle: 'h24' });
    return `${dateStr} ${timeStr}`;
}

interface TimelineEntry {
    time: number;
    user: User;
    action: 'followed' | 'unfollowed';
}

let historyFilter: 'all' | 'followed' | 'unfollowed' = 'all';
function createTimelineFromHistory(history: FollowersHistory[]): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    for (const entry of history) {
        if (historyFilter !== 'unfollowed') {
            for (const user of entry.added) {
                timeline.push({
                    time: entry.time,
                    user,
                    action: 'followed'
                });
            }
        }
        if (historyFilter !== 'followed') {
            for (const user of entry.removed) {
                timeline.push({
                    time: entry.time,
                    user,
                    action: 'unfollowed'
                });
            }
        }
    }
    return timeline;
}

let historyScrolledOnLoad = false;
async function renderFollowerHistory(): Promise<void> {
    let history: FollowersHistory[];
    let currentFollowing: User[];
    try {
        history = await getFollowersHistory(1000);
        currentFollowing = await getCurrentFollowing();
    } catch (error) {
        console.error('Failed to render follower history:', error);
        followersHistoryList.innerHTML = '<div class="history-entry">Error loading history</div>';
        return;
    }

    const timeline = createTimelineFromHistory(history);

    followersHistoryList.innerHTML = '';
    if (timeline.length === 0) {
        return;
    }

    const followingIds = new Set(currentFollowing.map(user => user.id));

    const fragment = document.createDocumentFragment();
    for (const entry of timeline) {
        const timeStr = new Date(entry.time).toLocaleDateString(undefined, { dateStyle: 'medium' });
        const actionClass = entry.action;
        const actionText = entry.action;

        const entryDiv = document.createElement('div');
        entryDiv.className = `history-entry ${actionClass}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'history-time';
        timeSpan.textContent = timeStr;
        entryDiv.appendChild(timeSpan);

        const usernameLink = document.createElement('a') as HTMLAnchorElement;
        usernameLink.className = 'history-username';
        usernameLink.href = `https://www.instagram.com/${entry.user.username}`;
        usernameLink.textContent = `@${entry.user.username}`;
        usernameLink.target = '_blank';
        entryDiv.appendChild(usernameLink);

        const actionSpan = document.createElement('span');
        actionSpan.textContent = ` ${actionText}`;
        entryDiv.appendChild(actionSpan);

        if (followingIds.has(entry.user.id)) {
            const followingSpan = document.createElement('span');
            followingSpan.className = 'following-back-indicator';
            followingSpan.textContent = '(mutual)';
            entryDiv.appendChild(followingSpan);
        }

        fragment.appendChild(entryDiv);
    }
    followersHistoryList.appendChild(fragment);

    if (!historyScrolledOnLoad) {
        const savedPosition = await getHistoryScrollPosition();
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
        const history = await getCountsHistory(MAX_DAYS);
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
    fullError = await getLastError();
    errorLabel.textContent = truncateMessage(fullError, 150);
    usernameLabel.textContent = await getStoredUsername();
    if (usernameLabel.textContent === '') {
        usernameLabel.textContent = '?';
    }

    const counts = await getLatestCounts();
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

    const delta = await getFollowersDelta(7);
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

// For some reason (bad paging?) we may get duplicate users in following or followers lists.
function deduplicateUsers(users: User[]) {
    const result: User[] = [];
    const seenIds: Set<string> = new Set();
    for (const user of users) {
        if (seenIds.has(user.id)) {
            continue;
        }
        seenIds.add(user.id);
        result.push(user);
    }
    return result;
}

async function doRefresh() {
    try {
        lastRefreshTimeLabel.textContent = 'in progress...';

        const refreshTime = Date.now();
        const userId = await getUserId();
        const username = await getUsername(userId);
        await storeUsername(username);

        console.log('Fetching followers');
        followersCountLabel.textContent = '0...';
        let followers: User[] = [];
        let maxId = null;
        while (true) {
            const page = await getFriendshipPage(userId, 'followers', maxId);
            followers.push(...page.users);
            if (!page.nextMaxId) {
                break;
            }
            followersCountLabel.textContent = followers.length.toString() + '...';
            maxId = page.nextMaxId;
        }
        followers = deduplicateUsers(followers);
        followersCountLabel.textContent = followers.length.toString();
        await storeFollowersAndUpdateHistory(followers, refreshTime);

        console.log('Fetching following');
        followingCountLabel.textContent = '0...';
        let following: User[] = [];
        maxId = null;
        while (true) {
            const page = await getFriendshipPage(userId, 'following', maxId);
            following.push(...page.users);
            if (!page.nextMaxId) {
                break;
            }
            followingCountLabel.textContent = following.length.toString() + '...';
            maxId = page.nextMaxId;
        }
        following = deduplicateUsers(following);
        followingCountLabel.textContent = following.length.toString();

        await storeFollowing(following);

        await storeCounts({
            time: refreshTime,
            followersCount: followers.length,
            followingCount: following.length
        });
        await storeLastError('');
    } catch (error) {
        if (error instanceof Error) {
            await storeLastError(getErrorMessage(error));
        } else {
            console.error('Got strange error', error);
            await storeLastError(`Unknown error: ${error}`);
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
        await storeHistoryScrollPosition(followersHistoryList.scrollTop);
    }
});

await refreshUi();
