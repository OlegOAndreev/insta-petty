import type { User } from "./models.js";

const WELL_KNOWN_APP_ID = '936619743392459';
const DELAY_FETCH_MIN_MS = 1000;
const DELAY_FETCH_MAX_MS = 3000;
const MAX_RETRIES = 5;
const RETRY_TIMEOUT_MS = 3000;
const MAX_FETCH_TIMEOUT_MS = 15000;

// Get user id from cookies or show the page to login into instagram.
export async function getUserId(): Promise<string> {
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
export async function getUsername(userId: string): Promise<string> {
    try {
        console.log(`Fetching username for ${userId}`);
        const url = `https://www.instagram.com/api/v1/users/${userId}/info/`;
        const response = await doFetchJson(url);
        if ('user' in response) {
            if ('username' in response.user) {
                return String(response.user.username);
            }
        }
        throw new Error(`Getting username failed, unknown answer: ${JSON.stringify(response)}`)
    } catch (error) {
        throw new Error('Getting username failed', { cause: error });
    }
}

export interface Page {
    users: User[];
    nextMaxId: string | null;
}

function getRandomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

// Return the next page of following or followers and the token for the next page. If token is null, the page is the last.
export async function getFriendshipPage(userId: string, friendshipType: 'following' | 'followers', maxId: string | null): Promise<Page> {
    try {
        const result: User[] = [];

        let url = `https://www.instagram.com/api/v1/friendships/${userId}/${friendshipType}?count=12&search_surface=follow_list_page`;
        if (maxId) {
            url += `&max_id=${maxId}`;
        }
        const response = await doFetchJson(url);
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

async function doFetchJson(url: string) {
    let count = MAX_RETRIES;
    while (true) {
        let response: Response;
        try {
            response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'x-ig-app-id': WELL_KNOWN_APP_ID
                },
                signal: AbortSignal.timeout(MAX_FETCH_TIMEOUT_MS)
            });

            // Limit calls to fetch() per second
            const nextFetchSleep = getRandomBetween(DELAY_FETCH_MIN_MS, DELAY_FETCH_MAX_MS);
            if (nextFetchSleep > 0) {
                console.debug(`Sleeping ${nextFetchSleep}ms to avoid rate limiting`);
                await sleep(nextFetchSleep);
            }

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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
