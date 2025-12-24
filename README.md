# Stealth Line

Stealth Line is a confidential group chat for on-chain communities. Each group (a "Line") has an encrypted 8-digit
shared secret stored on-chain with Zama FHEVM, and members use that secret to encrypt and decrypt messages off-chain.

## Why This Exists

Public blockchains are excellent for coordination but terrible for privacy. Chat messages and group keys can be exposed
to anyone if stored in plaintext. Stealth Line solves this by:

- keeping the per-line secret encrypted on-chain (never revealed in plaintext),
- granting decryption permission only to members,
- encrypting messages with the secret so only members can decrypt them.

## Core Advantages

- Confidentiality on a public chain: ciphertext only, no plaintext messages.
- Member-gated access: only members can decrypt the line secret.
- Simple sharing model: one secret per line, easy to rotate in future iterations.
- Transparent metadata: group existence, members, and message counts stay auditable.
- Minimal on-chain footprint: only encrypted data and metadata are stored.

## How It Works (End-to-End Flow)

1. A user creates a Line with a name.
2. The contract generates a random 8-digit number A and encrypts it with FHEVM.
3. The encrypted A is stored in the Line, and the creator is granted decryption rights.
4. A new member joins the Line and is granted decryption rights for A.
5. Members decrypt A client-side via the Zama relayer.
6. A member encrypts a message with A (client-side) and sends the ciphertext on-chain.
7. Other members read the ciphertext and decrypt it with A (client-side).

## Project Structure

```
contracts/    Smart contracts (Line.sol)
deploy/       Deployment scripts
tasks/        Hardhat tasks
test/         Contract tests
frontend/     React + Vite dapp
docs/         Zama references
```

## Smart Contract Details

Contract: `Line.sol`

Key data:
- Line metadata: name, creator, createdAt, memberCount
- Encrypted secret: euint32 (the 8-digit A)
- Membership map: address -> member flag
- Messages: sender, timestamp, encrypted message string

Key functions:
- `createLine(name)`: creates a line, generates encrypted 8-digit A, grants creator access
- `joinLine(lineId)`: grants member access to the encrypted A
- `sendMessage(lineId, encryptedMessage)`: stores encrypted messages
- `getLine(lineId)`: returns metadata and encrypted secret
- `getMessage(lineId, messageId)`: returns encrypted message data

Events:
- `LineCreated`, `LineJoined`, `MessageSent`

## Encryption and Privacy Model

- The 8-digit secret A is generated on-chain with `FHE.randEuint32`.
- A is always stored encrypted; plaintext is never exposed on-chain.
- Decryption rights are granted with `FHE.allow` only to members.
- Messages are encrypted off-chain using A; only ciphertext is stored.
- Line metadata and member addresses are public by design.

## Frontend Architecture

- React + Vite UI with RainbowKit + wagmi wallet flow
- Read operations use `viem`
- Write operations use `ethers`
- Zama relayer is used to decrypt A and to support encryption flows
- No local storage and no localhost network usage for contract interaction

## Tech Stack

- Smart contracts: Solidity, Hardhat
- FHE: Zama FHEVM, `@fhevm/solidity`
- Frontend: React 19, Vite, RainbowKit, wagmi
- Client crypto + relayer: `@zama-fhe/relayer-sdk`
- RPC + wallet: viem (reads), ethers (writes)
- Package manager: npm

## Setup

Prerequisites:
- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Frontend dependencies:

```bash
cd frontend
npm install
```

## Build, Test, and Deploy

Compile contracts:

```bash
npm run compile
```

Run tests:

```bash
npm run test
```

Local deployment (FHEVM-ready node):

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Sepolia deployment:

```bash
npx hardhat deploy --network sepolia
```

Required environment values for deployment (set in `.env`):
- `PRIVATE_KEY` (no mnemonic usage)
- `INFURA_API_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)

## Frontend Usage

Run the UI:

```bash
cd frontend
npm run dev
```

Workflow in the UI:
1. Connect wallet (Sepolia).
2. Create a new Line with a name.
3. Join a Line to receive decryption access.
4. Decrypt the line secret A via relayer.
5. Encrypt a message with A and send it.
6. Decrypt incoming messages with A.

## ABI and Network Notes

- The frontend uses the contract ABI generated from Hardhat deployments.
- ABI source is `deployments/sepolia`, and should be copied into the frontend as needed.
- Contract interaction is expected on Sepolia (or a configured FHEVM network).

## Security Considerations

- The secret A is only 8 digits; confidentiality relies on FHE access control and off-chain handling.
- If a member's wallet or device is compromised, A and messages can be exposed.
- On-chain metadata (names, timestamps, senders) is public by design.
- Use clear group names that do not reveal sensitive info if privacy is critical.

## Limitations

- Message confidentiality depends on client-side encryption and correct relayer usage.
- No key rotation or member revocation workflow yet.
- No attachments or rich media encryption in this version.

## Future Roadmap

- Key rotation and member revocation
- Per-message forward secrecy
- Encrypted attachments and metadata minimization
- Activity indexing and better chat UX
- Additional networks and gas optimizations

## License

BSD-3-Clause-Clear. See `LICENSE`.
