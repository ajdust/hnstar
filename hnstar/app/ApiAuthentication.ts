import * as Dexie from "dexie";

const API_URL = "/";
const _encoder = new TextEncoder();

function encode(m: string) {
    return _encoder.encode(m);
}

function toBase64(array: Uint8Array | ArrayBuffer) {
    const u8a: Uint8Array = array instanceof ArrayBuffer ? new Uint8Array(array) : array;
    return btoa(String.fromCharCode(...u8a));
}

interface ICredential {
    id: 1;
    token: string;
    expires: Date;
    key: CryptoKeyPair;
    username: string;
}

interface ICredentialRefresh {
    token: string;
    expires: Date;
}

class CredentialDatabase extends Dexie.Dexie {
    credentials: Dexie.Table<ICredential, number>;

    constructor() {
        super("AppDatabase3");

        this.version(1).stores({
            credentials: "id,token,expires,key,username",
        });

        this.credentials = this.table("credentials");
    }

    async set(value: ICredential | null) {
        await this.credentials.delete(1);
        if (value) {
            await this.credentials.add(value, 1);
        }
    }

    async get(): Promise<ICredential | null> {
        return (await this.credentials.get(1)) || null;
    }

    async refresh(value: ICredentialRefresh) {
        const current = await this.get();
        if (!current) {
            return;
        }

        await this.credentials.put({ ...value, id: 1, key: current.key, username: current.username });
    }
}

const CREDENTIAL = new CredentialDatabase();

export interface SignRequestData {
    username: string;
    password: string;
    timestamp: string;
    publicKey: JsonWebKey;
    signature: string;
}

export interface SignInResponse {
    userId: number;
    username: string;
    token: string;
    expires: string;
}

function validateSignInResponse(data: SignInResponse): string | null {
    if (!data) return "Invalid sign in response: no data";
    if (typeof data.userId !== "number") return "Invalid sign in response: bad userId";
    if (typeof data.username !== "string") return "Invalid sign in response: bad username";
    if (typeof data.token !== "string") return "Invalid sign in response: bad token";
    if (typeof data.expires != "string") return "Invalid sign in response: bad expires";
    return null;
}

interface SignData {
    credential: SignRequestData;
    key: CryptoKeyPair;
}

// Create data for a new sign in or sign up
async function createSignData(username: string, password: string): Promise<SignData> {
    const key = await crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-512",
        },
        false,
        ["sign", "verify"]
    );

    const now = new Date().toISOString().slice(0, 19);
    const message = `${now}${username}`;
    const raw = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, encode(message));
    const signature = toBase64(raw);
    const jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
    const credential = {
        username: username,
        password: password,
        timestamp: now,
        publicKey: jwk,
        signature: signature,
    };

    return {
        credential: credential,
        key: key,
    };
}

// Get the current authentication header, if any
export async function getAuthorizationHeader(): Promise<string | null> {
    const cred = await CREDENTIAL.get();
    if (!cred) {
        return null;
    }

    const now = new Date().toISOString().slice(0, 19);
    const raw = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cred.key.privateKey, encode(`${now}${cred.token}`));
    const signature = toBase64(raw);
    const sigCred = {
        timestamp: now,
        token: cred.token,
        signature: signature,
    };

    return `Signature ${toBase64(encode(JSON.stringify(sigCred)))}`;
}

export async function signOut(): Promise<boolean> {
    const header = await getAuthorizationHeader();
    if (!header) {
        console.warn("Expected to be signed in to sign out, but actually was already signed out.");
        return false;
    }

    const response = await fetch(API_URL + "authenticate/sign_out", {
        method: "POST",
        headers: {
            Authorization: header,
        },
    });

    if (response.status !== 200) {
        console.warn(response);
        return false;
    }

    await CREDENTIAL.set(null);
    return true;
}

export async function signInTokenRefresh(): Promise<boolean> {
    const header = await getAuthorizationHeader();
    if (!header) {
        console.warn("Expected to be signed in to refresh token, but actually was already signed out.");
        return false;
    }

    const response = await fetch(API_URL + "authenticate/sign_in_token_refresh", {
        method: "POST",
        headers: {
            Authorization: header,
        },
    });

    if (response.status !== 200) {
        console.warn(response);
        return false;
    }

    const data = (await response.json()) as SignInResponse;
    const error = validateSignInResponse(data);
    if (error) {
        console.warn(error);
        return false;
    }

    await CREDENTIAL.refresh({
        expires: new Date(data.expires),
        token: data.token,
    });

    return true;
}

export async function signUp(credentials: { username: string; password: string }): Promise<SignInResponse | null> {
    const { username, password } = credentials;
    const sid = await createSignData(username, password);
    const response = await fetch(API_URL + "authenticate/sign_up", {
        method: "POST",
        body: JSON.stringify(sid.credential),
        headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
        console.warn(response);
        return null;
    }

    const data = (await response.json()) as SignInResponse;
    const error = validateSignInResponse(data);
    if (error) {
        console.warn(error);
        return null;
    }

    await CREDENTIAL.set({
        id: 1,
        expires: new Date(data.expires),
        token: data.token,
        key: sid.key,
        username: data.username,
    });

    return null;
}

export interface UserDataResponse {
    userId: number;
    username: string;
    name: string | null;
    email: string | null;
    status: number;
    created: string;
    updated: string;
}

function validateUserDataResponse(data: UserDataResponse): string | null {
    if (!data) return "Invalid user data response: no data";
    if (typeof data.userId !== "number") return "Invalid user data response: bad userId";
    if (typeof data.username !== "string") return "Invalid user data response: bad username";
    if (typeof data.created !== "string") return "Invalid user data response: bad created";
    return null;
}

export async function getUser(): Promise<UserDataResponse | null> {
    const header = await getAuthorizationHeader();
    if (!header) {
        console.warn("Expected to be signed in to get user data, but was actually signed out.");
        return null;
    }

    const response = await fetch(API_URL + "authenticate/get", {
        method: "POST",
        headers: {
            Authorization: header,
        },
    });

    if (response.status !== 200) {
        console.warn(response);
        return null;
    }

    const data = (await response.json()) as UserDataResponse;
    const error = validateUserDataResponse(data);
    if (error) {
        console.warn(error);
        return null;
    }

    return data;
}

export async function signIn(credentials: { username: string; password: string }): Promise<SignInResponse | null> {
    const { username, password } = credentials;
    const sid = await createSignData(username, password);
    const response = await fetch(API_URL + "authenticate/sign_in", {
        method: "POST",
        body: JSON.stringify(sid.credential),
        headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) {
        console.warn(response);
        return null;
    }

    const data = (await response.json()) as SignInResponse;
    const error = validateSignInResponse(data);
    if (error) {
        console.warn(error);
        return null;
    }

    await CREDENTIAL.set({
        id: 1,
        expires: new Date(data.expires),
        token: data.token,
        key: sid.key,
        username: data.username,
    });

    return data;
}
