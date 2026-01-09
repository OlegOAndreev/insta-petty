import type { User } from "./models.js";
import { sleep } from "./utils.js";

const WELL_KNOWN_APP_ID = '936619743392459';
const DELAY_FETCH_MIN_MS = 2000;
const DELAY_FETCH_MAX_MS = 4000;
const MAX_RETRIES = 5;
const RETRY_TIMEOUT_MS = 3000;
const MAX_FETCH_TIMEOUT_MS = 15000;

export interface UserPage {
    users: User[];
    nextMaxId: string | null;
}

export class InstagramClient {
    private lastFetchTime: number = 0;

    // Get user id from cookies or show the page to login into instagram.
    async getUserId(): Promise<string> {
        try {
            const cookie = await browser.cookies.get({
                url: 'https://www.instagram.com',
                name: 'ds_user_id',
            });
            if (!cookie) {
                throw new Error('You need to log in https://instagram.com in this browser first');
            }
            const userId = cookie.value;
            console.log(`Got user id ${userId}`);
            return userId;
        } catch (error) {
            throw new Error('Getting user id failed', { cause: error });
        }
    }

    // Get username from user id.
    async getUsername(userId: string): Promise<string> {
        try {
            console.log(`Fetching username for ${userId}`);
            const url = `https://www.instagram.com/api/v1/users/${userId}/info/`;
            const response = await this.doFetchJson(url);
            if (response && response.user && response.user.username) {
                console.log(`Got username ID ${response.user.username} for user ID ${userId}`);
                return String(response.user.username);
            }
            throw new Error(`Getting username failed, unknown answer: ${JSON.stringify(response)}`)
        } catch (error) {
            throw new Error('Getting username failed', { cause: error });
        }
    }

    // Get user ID from Instagram username using web_profile_info API.
    async getUserIdFromUsername(username: string): Promise<string> {
        try {
            console.log(`Fetching user ID for username: ${username}`);
            const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
            const response = await this.doFetchJson(url);

            // Check response structure
            if (response && response.data && response.data.user && response.data.user.id) {
                const userId = String(response.data.user.id);
                console.log(`Got user ID ${userId} for username ${username}`);
                return userId;
            }

            throw new Error(`Getting user ID failed, unexpected response structure: ${JSON.stringify(response)}`);
        } catch (error) {
            throw new Error(`Getting user ID for username '${username}' failed`, { cause: error });
        }
    }

    // Return the next page of following or followers and the token for the next page. If token is null, the page is the last.
    async getFriendshipPage(userId: string, friendshipType: 'following' | 'followers', maxId: string | null): Promise<UserPage> {
        try {
            const result: User[] = [];

            let url = `https://www.instagram.com/api/v1/friendships/${userId}/${friendshipType}?count=12&search_surface=follow_list_page`;
            if (maxId) {
                url += `&max_id=${maxId}`;
            }
            const response = await this.doFetchJson(url);
            console.debug('API response:', response);

            if (!('users' in response)) {
                throw new Error(`Parsing users list failed, no users field: ${JSON.stringify(response)}`)
            }
            const usersList = response.users || [];
            for (const user of usersList) {
                if (!('username' in user) || !('id' in user)) {
                    throw new Error(`Parsing users list failed, malformed users: ${JSON.stringify(response)}`)
                }
                result.push({
                    id: String(user.id ?? ''),
                    username: String(user.username ?? ''),
                    fullName: String(user.full_name ?? '')
                });
            }

            let nextMaxId: string | null = null;
            if (response.has_more === true) {
                nextMaxId = response.next_max_id;
                if (!nextMaxId) {
                    throw new Error('Empty nextMaxId, while hasMore is true');
                }
            }
            return { users: result, nextMaxId: nextMaxId };
        } catch (error) {
            throw new Error(`Fetching ${friendshipType} failed`, { cause: error });
        }
    }

    async doFetchJson(url: string) {
        let count = MAX_RETRIES;
        while (true) {
            let response: Response;
            try {
                // Limit calls to fetch() per second
                const nextFetchDelay = getRandomBetween(DELAY_FETCH_MIN_MS, DELAY_FETCH_MAX_MS);
                const now = Date.now();
                const toSleep = this.lastFetchTime + nextFetchDelay - now;
                if (toSleep > 0) {
                    console.debug(`Sleeping ${toSleep}ms to avoid rate limiting`);
                    await sleep(toSleep);
                }
                this.lastFetchTime = now;

                response = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        'x-ig-app-id': WELL_KNOWN_APP_ID
                    },
                    signal: AbortSignal.timeout(MAX_FETCH_TIMEOUT_MS)
                });


                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'TimeoutError' && count > 0) {
                    console.warn(`Request timeout for ${url}, retrying in ${RETRY_TIMEOUT_MS}ms (${count} retries left)`);
                    await sleep(RETRY_TIMEOUT_MS);
                    count--;
                    continue;
                }
                throw error;
            }

            const status = response.status;
            if (status >= 500 && count > 0) {
                console.warn(`Got HTTP status ${status} for ${url}, retrying in ${RETRY_TIMEOUT_MS}ms (${count} retries left)`);
                await sleep(RETRY_TIMEOUT_MS);
                count--;
                continue;
            }

            const responseText = await response.text();
            throw new Error(`Got HTTP status ${status} for ${url}, body: ${responseText}`);
        }
    }
}

function getRandomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}
