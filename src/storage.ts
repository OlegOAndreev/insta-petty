import { openDB, type IDBPDatabase } from 'idb';
import type { CountHistory, FollowersHistory, User } from "./models.js";

let dbPromise: Promise<IDBPDatabase> | null = null;
async function getDB(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB('insta-petty', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('followers')) {
                    db.createObjectStore('followers');
                }
                if (!db.objectStoreNames.contains('followers_history')) {
                    db.createObjectStore('followers_history', { keyPath: 'time' });
                }
                if (!db.objectStoreNames.contains('counts_history')) {
                    db.createObjectStore('counts_history', { keyPath: 'time' });
                }
            },
            terminated() {
                console.error('IndexedDB connection terminated');
                dbPromise = null; // Reset promise to allow reconnection
            }
        });
    }
    return dbPromise;
}

export async function getLastError(): Promise<string> {
    const data = await browser.storage.local.get(['lastError']);
    return data['lastError'] ?? '';
}

export async function storeLastError(message: string) {
    console.log(`Stored error ${message}`);
    await browser.storage.local.set({ lastError: message });
}

export async function getStoredUsername(): Promise<string> {
    const data = await browser.storage.local.get(['userName']);
    const username = data['userName'] ?? '';
    console.log(`Got stored user name ${username}`);
    return username;
}

export async function storeUsername(username: string) {
    console.log(`Stored user name ${username}`);
    await browser.storage.local.set({ userName: username });
}

export async function storeFollowersAndUpdateHistory(followers: User[], time: number) {
    try {
        const db = await getDB();

        const tx = db.transaction(['followers', 'followers_history'], 'readwrite');
        const followersStore = tx.objectStore('followers');
        const historyStore = tx.objectStore('followers_history');

        const prevFollowers: User[] = (await followersStore.get('current')) || [];
        console.debug('Previous followers:', prevFollowers);

        console.log(`Stored ${followers.length} followers at time ${time}`);
        await followersStore.put(followers, 'current');

        const prevIds = new Set(prevFollowers.map(user => user.id));
        const newIds = new Set(followers.map(user => user.id));

        const added = followers.filter(user => !prevIds.has(user.id));
        const removed = prevFollowers.filter(user => !newIds.has(user.id));

        const historyEntry = {
            time: time,
            added: added,
            removed: removed
        };
        await historyStore.put(historyEntry);
        console.log(`Stored followers diff at time ${time}: added ${added.length}, removed ${removed.length}`);

        await tx.done;
    } catch (error) {
        throw new Error('Storing followers failed', { cause: error });
    }
}

export async function storeCounts(countHistory: CountHistory) {
    try {
        const db = await getDB();
        await db.put('counts_history', countHistory);
        console.log('Stored counts', countHistory);
    } catch (error) {
        throw new Error('Storing counts failed', { cause: error });
    }
}

export async function getLatestCounts(): Promise<CountHistory | null> {
    try {
        const db = await getDB();
        const tx = db.transaction('counts_history', 'readonly');
        const cursor = await tx.store.openCursor(null, 'prev');
        if (!cursor) {
            return null;
        }
        const latestEntry = cursor.value as CountHistory;
        console.debug('Got latest entry', latestEntry);
        return latestEntry;
    } catch (error) {
        throw new Error('Getting latest counts failed', { cause: error });
    }
}

export async function getCountsHistory(maxDays: number): Promise<CountHistory[]> {
    try {
        const db = await getDB();
        const tx = db.transaction('counts_history', 'readonly');
        const MS_PER_DAY = 24 * 3600 * 1000;
        const cutoff = Date.now() - (maxDays * MS_PER_DAY);
        const entries: CountHistory[] = [];
        let cursor = await tx.store.openCursor(IDBKeyRange.lowerBound(cutoff));
        while (cursor) {
            entries.push(cursor.value as CountHistory);
            cursor = await cursor.continue();
        }
        console.debug(`Got counts history entries ${entries.length}`);
        return entries;
    } catch (error) {
        throw new Error('Getting counts history failed', { cause: error });
    }
}

export async function getFollowersHistory(maxEntries: number): Promise<FollowersHistory[]> {
    try {
        const db = await getDB();
        const tx = db.transaction('followers_history', 'readonly');
        const entries: FollowersHistory[] = [];
        let cursor = await tx.store.openCursor(null, 'prev');
        let count = 0;
        while (cursor && count < maxEntries) {
            entries.push(cursor.value as FollowersHistory);
            cursor = await cursor.continue();
            count++;
        }
        console.debug(`Got followers history entries ${entries.length}`);
        return entries;
    } catch (error) {
        throw new Error('Getting followers history failed', { cause: error });
    }
}

export async function storeHistoryScrollPosition(scrollTop: number): Promise<void> {
    const scrollData = {
        scrollTop,
        timestamp: Date.now()
    };
    await browser.storage.local.set({ historyScrollPosition: scrollData });
    console.debug(`Stored history scroll position: ${scrollTop} at ${scrollData.timestamp}`);
}

export async function getHistoryScrollPosition(): Promise<number> {
    const data = await browser.storage.local.get(['historyScrollPosition']);
    const scrollData = data['historyScrollPosition'];

    if (!scrollData) {
        return 0;
    }

    const HISTORY_SCROLL_POSITION_TTL = 30 * 60 * 1000;
    if (!scrollData.timestamp || scrollData.timestamp < Date.now() - HISTORY_SCROLL_POSITION_TTL) {
        console.debug(`Ignoring stale scroll position (${scrollData.timestamp})`);
        return 0;
    }
    return scrollData.scrollTop ?? 0;
}
