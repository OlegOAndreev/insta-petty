import { openDB, type IDBPDatabase } from 'idb';
import type { CountDelta, CountHistory, FollowersHistory, User } from "./models.js";

// Most of the data is stored in IndexedDB, but user-related and some auxillary data is using the Storage API.
export class InstagramStorage {
    private dbPromise: Promise<IDBPDatabase> | null = null;

    private async getDB(): Promise<IDBPDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = openDB('insta-petty', 2, {
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
                    if (!db.objectStoreNames.contains('following')) {
                        db.createObjectStore('following');
                    }
                },
                terminated: () => {
                    console.error('IndexedDB connection terminated');
                    this.dbPromise = null;
                }
            });
        }
        return this.dbPromise;
    }

    async getLastError(): Promise<string> {
        const data = await browser.storage.local.get('lastError');
        return data['lastError'] ?? '';
    }

    async putLastError(message: string) {
        console.log(`Stored error ${message}`);
        await browser.storage.local.set({ lastError: message });
    }

    async getCustomUserId(): Promise<string> {
        const data = await browser.storage.local.get('customUserId');
        const userId = data['customUserId'] ?? '';
        console.log(`Got custom user ID ${userId}`);
        return userId;
    }

    async putCustomUserId(userId: string): Promise<void> {
        console.log(`Stored custom user ID ${userId}`);
        await browser.storage.local.set({ customUserId: userId });
    }

    async getUsername(): Promise<string> {
        const data = await browser.storage.local.get('userName');
        const username = data['userName'] ?? '';
        console.log(`Got stored user name ${username}`);
        return username;
    }

    async putUsername(username: string) {
        console.log(`Stored user name ${username}`);
        await browser.storage.local.set({ userName: username });
    }

    async clearAllData(): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction(
                ['followers', 'followers_history', 'counts_history', 'following'],
                'readwrite'
            );
            await tx.objectStore('followers').clear();
            await tx.objectStore('followers_history').clear();
            await tx.objectStore('counts_history').clear();
            await tx.objectStore('following').clear();
            await tx.done;
            console.log('Cleared all user data from IndexedDB');
        } catch (error) {
            throw new Error('Clearing all data failed', { cause: error });
        }
    }

    async hasStoredData(): Promise<boolean> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('followers', 'readonly');
            const followers: User[] = await tx.store.get('current');
            return followers && followers.length > 0;
        } catch (error) {
            console.error('Error checking for stored data:', error);
            return false;
        }
    }

    async putFollowersAndUpdateHistory(followers: User[], time: number) {
        try {
            const db = await this.getDB();

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

    async putCounts(countHistory: CountHistory) {
        try {
            const db = await this.getDB();
            await db.put('counts_history', countHistory);
            console.log('Stored counts', countHistory);
        } catch (error) {
            throw new Error('Storing counts failed', { cause: error });
        }
    }

    async getLatestCounts(): Promise<CountHistory | null> {
        try {
            const db = await this.getDB();
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

    async getCountsHistory(maxDays: number): Promise<CountHistory[]> {
        try {
            const db = await this.getDB();
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

    async getFollowersHistory(maxEntries: number): Promise<FollowersHistory[]> {
        try {
            const db = await this.getDB();
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

    async putFollowing(following: User[]): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('following', 'readwrite');
            await tx.store.put(following, 'current');
            console.log(`Stored ${following.length} following users`);
            await tx.done;
        } catch (error) {
            throw new Error('Storing following failed', { cause: error });
        }
    }

    async getCurrentFollowing(): Promise<User[]> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('following', 'readonly');
            const following = (await tx.store.get('current')) || [];
            console.debug(`Got ${following.length} following users`);
            return following;
        } catch (error) {
            throw new Error('Getting following failed', { cause: error });
        }
    }

    async getFollowersDelta(deltaDays: number): Promise<CountDelta> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('followers_history', 'readonly');

            const now = Date.now();
            const cutoff = now - (deltaDays * 24 * 3600 * 1000);
            let totalAdded = 0;
            let totalRemoved = 0;
            let cursor = await tx.store.openCursor(IDBKeyRange.lowerBound(cutoff));
            while (cursor) {
                const entry = cursor.value as FollowersHistory;
                totalAdded += entry.added.length;
                totalRemoved += entry.removed.length;
                cursor = await cursor.continue();
            }

            return { added: totalAdded, removed: totalRemoved };
        } catch (error) {
            throw new Error('Getting followers delta failed', { cause: error });
        }
    }

    async putHistoryScrollPosition(scrollTop: number): Promise<void> {
        const scrollData = {
            scrollTop,
            timestamp: Date.now()
        };
        await browser.storage.local.set({ historyScrollPosition: scrollData });
        console.debug(`Stored history scroll position: ${scrollTop} at ${scrollData.timestamp}`);
    }

    async getHistoryScrollPosition(): Promise<number> {
        const data = await browser.storage.local.get('historyScrollPosition');
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
}
