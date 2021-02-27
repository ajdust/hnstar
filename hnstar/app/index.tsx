import "regenerator-runtime/runtime";
import * as Dexie from "dexie";
import * as React from "react";
import { ChangeEvent, useState } from "react";
import * as ReactDOM from "react-dom";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

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

interface SignRequestData {
    username: string;
    password: string;
    timestamp: string;
    publicKey: JsonWebKey;
    signature: string;
}

interface SignData {
    credential: SignRequestData;
    key: CryptoKeyPair;
}

interface SignInResponse {
    userId: number;
    username: string;
    token: string;
    expires: string;
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
async function getCurrentHeader(): Promise<string | null> {
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

interface Logs {
    logs: string[];
    log: (message: string) => void;
}

interface UserData {
    username: string;
    status: "signed_in" | "signed_out";
    expires: string;
}

interface CurrentUser {
    user: UserData;
    setUser: (data: UserData) => void;
}

type State = Logs & CurrentUser;

interface LabelInputData {
    id: string;
    name: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function LabelInput(props: LabelInputData) {
    const { id, name, value, onChange } = props;
    return (
        <>
            <Form.Label htmlFor={id}>{name}</Form.Label>
            <Form.Control type={"text"} id={id} value={value} onChange={onChange}></Form.Control>
        </>
    );
}

function Status(props: CurrentUser) {
    const { status, username, expires } = props.user;
    return (
        <div className={"status api-test-form"}>
            {status === "signed_in" ? <i>Signed In</i> : <i>Signed Out</i>}
            {" as "}
            <i>{username}</i>
            {` session expires ${expires}`}
        </div>
    );
}

function SignIn(props: State) {
    const { log, setUser } = props;
    const [un, setUn] = useState("");
    const [pw, setPw] = useState("");

    const go = async () => {
        const sid = await createSignData(un, pw);
        const response = await fetch(API_URL + "authenticate/sign_in", {
            method: "POST",
            body: JSON.stringify(sid.credential),
            headers: { "Content-Type": "application/json" },
        });

        if (response.status !== 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        const responseData = (await response.json()) as SignInResponse;
        await CREDENTIAL.set({
            id: 1,
            expires: new Date(responseData.expires),
            token: responseData.token,
            key: sid.key,
            username: responseData.username,
        });

        log(`"${responseData.username}" signed in successfully obtaining token "${responseData.token}".`);
        setUser({ status: "signed_in", username: responseData.username, expires: responseData.expires });
    };

    return (
        <Form className="api-test-form">
            {" "}
            <Form.Group>
                <LabelInput
                    id={"sign-in-username"}
                    name={"Username"}
                    value={un}
                    onChange={(e) => setUn((e!.target! as HTMLInputElement).value)}
                />
                <LabelInput
                    id={"sign-in-password"}
                    name={"Password"}
                    value={pw}
                    onChange={(e) => setPw((e!.target! as HTMLInputElement).value)}
                />
            </Form.Group>
            <Button onClick={go}>Sign In</Button>
        </Form>
    );
}

function SignOut(props: State) {
    const { log, setUser } = props;
    const go = async () => {
        const header = await getCurrentHeader();
        if (!header) {
            log(`Not signed in, cannot sign out`);
            return;
        }

        const response = await fetch(API_URL + "authenticate/sign_out", {
            method: "POST",
            headers: {
                Authorization: header,
            },
        });

        if (response.status !== 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        await CREDENTIAL.set(null);
        log(`Signed out successfully.`);
        setUser({ status: "signed_out", username: "", expires: "" });
    };

    return (
        <Form className="api-test-form">
            <Button onClick={go}>Sign Out</Button>
        </Form>
    );
}

function SignInRefresh(props: State) {
    const { log, user, setUser } = props;

    const go = async () => {
        const header = await getCurrentHeader();
        if (!header) {
            log(`Not signed in, cannot sign in refresh`);
            return;
        }

        const response = await fetch(API_URL + "authenticate/sign_in_token_refresh", {
            method: "POST",
            headers: {
                Authorization: header,
            },
        });

        if (response.status !== 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        const responseData = (await response.json()) as SignInResponse;
        await CREDENTIAL.refresh({
            expires: new Date(responseData.expires),
            token: responseData.token,
        });

        log(`"${responseData.username}" refreshed signed in successfully obtaining token "${responseData.token}".`);
        setUser({ ...user, expires: responseData.expires });
    };

    return (
        <Form className="api-test-form">
            <Button onClick={go}>Sign In Refresh</Button>
        </Form>
    );
}

function SignUp(props: State) {
    const { log, setUser } = props;
    const [un, setUn] = useState("");
    const [pw, setPw] = useState("");

    const go = async () => {
        const sid = await createSignData(un, pw);
        const response = await fetch(API_URL + "authenticate/sign_up", {
            method: "POST",
            body: JSON.stringify(sid.credential),
            headers: { "Content-Type": "application/json" },
        });

        if (response.status !== 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        const responseData = (await response.json()) as SignInResponse;
        await CREDENTIAL.set({
            id: 1,
            expires: new Date(responseData.expires),
            token: responseData.token,
            key: sid.key,
            username: responseData.username,
        });

        log(`"${responseData.username}" signed in successfully obtaining token "${responseData.token}".`);
        setUser({ status: "signed_in", username: responseData.username, expires: responseData.expires });
    };

    return (
        <Form className="api-test-form">
            <Form.Group>
                <LabelInput
                    id={"sign-up-username"}
                    name={"Username"}
                    value={un}
                    onChange={(e) => setUn((e!.target! as HTMLInputElement).value)}
                />
                <LabelInput
                    id={"sign-up-password"}
                    name={"Password"}
                    value={pw}
                    onChange={(e) => setPw((e!.target! as HTMLInputElement).value)}
                />
            </Form.Group>
            <Button onClick={go}>Sign Up</Button>
        </Form>
    );
}

function GetUser(props: State) {
    const { log } = props;

    const go = async () => {
        const header = await getCurrentHeader();
        if (!header) {
            log(`Not signed in, cannot get user`);
            return;
        }

        const response = await fetch(API_URL + "authenticate/get", {
            method: "POST",
            headers: {
                Authorization: header,
            },
        });

        if (response.status !== 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        const responseData = await response.json();
        log(`"${responseData.username}" got user data: "${JSON.stringify(responseData)}".`);
    };

    return (
        <Form className="api-test-form">
            <Button onClick={go}>Get User</Button>
        </Form>
    );
}

function GetStories(props: State) {
    const { log } = props;

    const go = async () => {
        const header = await getCurrentHeader();
        if (!header) {
            log(`Not signed in, cannot get user`);
            return;
        }

        const response = await fetch(API_URL + "ranks/query", {
            method: "POST",
            body: JSON.stringify({
                "z-score": { gt: 0 },
            }),
            headers: {
                Authorization: header,
                "Content-Type": "application/json",
            },
        });

        if (response.status != 200) {
            console.warn(response);
            log(`${response.status}: ${await response.text()}`);
            return;
        }

        const responseData = await response.json();
        log(`${responseData.username} got data: ${JSON.stringify(responseData)}`);
    };

    return (
        <Form className="api-test-form">
            <Button onClick={go}>Get Stories</Button>
        </Form>
    );
}

function ApiTest(props: State) {
    return (
        <div className="api-test">
            <Status {...props} />
            <SignIn {...props} />
            <SignOut {...props} />
            <SignInRefresh {...props} />
            <SignUp {...props} />
            <GetUser {...props} />
            <GetStories {...props} />
        </div>
    );
}

function ApiTestLog(props: { messages: string[] }) {
    return (
        <div className="api-test-log">
            {props.messages.map((m, i) => {
                return <div className={"api-log"} key={i}>{`${i}: ${m}`}</div>;
            })}
        </div>
    );
}

function App() {
    const [status, setStatus] = useState({ status: "signed_out", username: "", expires: "" });
    const [messages, setMessages] = useState([] as string[]);
    const state: State = {
        logs: messages,
        log: (m) => setMessages(messages.concat(m)),
        user: status as { status: "signed_out"; username: string; expires: string },
        setUser: setStatus,
    };

    setTimeout(async () => {
        const cred = await CREDENTIAL.get();
        if (cred && cred.token) {
            setStatus({ status: "signed_in", username: cred.username, expires: cred.expires.toISOString() });
        }
    }, 0);

    return (
        <div className={"api-test-container"}>
            <ApiTest {...state} />
            <ApiTestLog messages={messages} />
        </div>
    );
}

function app() {
    return <App />;
}

document.addEventListener("DOMContentLoaded", () => {
    const appEl = document.getElementById("app")!;
    ReactDOM.render(app(), appEl);
});
