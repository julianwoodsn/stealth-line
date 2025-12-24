import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { Contract } from 'ethers';
import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/LineApp.css';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function asNumber(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value);
  }
  return 0;
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(value: unknown) {
  const timestamp = asNumber(value);
  if (!timestamp) {
    return '—';
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function xorBytes(bytes: Uint8Array, secret: number) {
  const output = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    const keyByte = (secret >> ((i % 4) * 8)) & 0xff;
    output[i] = bytes[i] ^ keyByte;
  }
  return output;
}

function encryptMessage(plaintext: string, secret: number): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const output = xorBytes(data, secret);
  return `0x${Array.from(output).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function decryptMessage(ciphertext: string, secret: number): string {
  const hex = ciphertext.startsWith('0x') ? ciphertext.slice(2) : ciphertext;
  if (!hex || hex.length % 2 !== 0) {
    return '';
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  const decoder = new TextDecoder();
  return decoder.decode(xorBytes(bytes, secret));
}

type LineSecrets = Record<number, number>;

type LineCardProps = {
  lineId: number;
  active: boolean;
  address?: Address;
  hasContract: boolean;
  onSelect: (lineId: number) => void;
  onJoin: (lineId: number) => void;
  isJoining: boolean;
};

function LineCard({ lineId, active, address, hasContract, onSelect, onJoin, isJoining }: LineCardProps) {
  const { data: lineData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLine',
    args: [BigInt(lineId)],
    query: {
      enabled: hasContract,
      refetchInterval: 12000,
    },
  });

  const { data: isMember } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isMember',
    args: address ? [BigInt(lineId), address] : undefined,
    query: {
      enabled: hasContract && !!address,
      refetchInterval: 12000,
    },
  });

  const name = (lineData?.[0] as string) || `Line #${lineId}`;
  const creator = (lineData?.[1] as string) || '';
  const createdAt = formatTimestamp(lineData?.[2]);
  const memberCount = asNumber(lineData?.[3]);

  const handleSelect = () => onSelect(lineId);

  return (
    <div className={`line-card ${active ? 'line-card-active' : ''}`}>
      <div
        className="line-card-main"
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelect();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div>
          <h3>{name}</h3>
          <p className="line-meta">
            <span>Creator {creator ? formatAddress(creator) : '—'}</span>
            <span>Created {createdAt}</span>
          </p>
        </div>
        <div className="line-count">
          <span>{memberCount || 0}</span>
          <small>Members</small>
        </div>
      </div>
      <div className="line-card-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={() => onSelect(lineId)}
        >
          {active ? 'Active' : 'Open'}
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={() => onJoin(lineId)}
          disabled={!address || Boolean(isMember) || isJoining}
        >
          {Boolean(isMember) ? 'Joined' : isJoining ? 'Joining…' : 'Join'}
        </button>
      </div>
    </div>
  );
}

type LineMessageProps = {
  lineId: number;
  messageId: number;
  hasContract: boolean;
  secret?: number;
};

function LineMessage({ lineId, messageId, hasContract, secret }: LineMessageProps) {
  const { data: messageData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getMessage',
    args: [BigInt(lineId), BigInt(messageId)],
    query: {
      enabled: hasContract,
      refetchInterval: 12000,
    },
  });

  const sender = (messageData?.[0] as string) || '';
  const timestamp = formatTimestamp(messageData?.[1]);
  const encrypted = (messageData?.[2] as string) || '';

  let decrypted = '';
  if (secret && encrypted) {
    try {
      decrypted = decryptMessage(encrypted, secret);
    } catch {
      decrypted = '';
    }
  }

  return (
    <div className="message-row">
      <div className="message-meta">
        <span>{sender ? formatAddress(sender) : '—'}</span>
        <span>{timestamp}</span>
      </div>
      <div className="message-body">
        <p>{decrypted || 'Encrypted message'}</p>
        <span className="message-hash">{encrypted}</span>
      </div>
    </div>
  );
}

type LineRoomProps = {
  lineId: number;
  address?: Address;
  hasContract: boolean;
  secrets: LineSecrets;
  decryptingLineId: number | null;
  onDecrypt: (lineId: number, secretHandle: string) => void;
  onSend: (lineId: number, encryptedMessage: string, plaintext: string) => void;
  sending: boolean;
};

function LineRoom({
  lineId,
  address,
  hasContract,
  secrets,
  decryptingLineId,
  onDecrypt,
  onSend,
  sending,
}: LineRoomProps) {
  const [draft, setDraft] = useState('');

  const { data: lineData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLine',
    args: [BigInt(lineId)],
    query: {
      enabled: hasContract,
      refetchInterval: 12000,
    },
  });

  const { data: isMember } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isMember',
    args: address ? [BigInt(lineId), address] : undefined,
    query: {
      enabled: hasContract && !!address,
      refetchInterval: 12000,
    },
  });

  const { data: messageCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getMessageCount',
    args: [BigInt(lineId)],
    query: {
      enabled: hasContract,
      refetchInterval: 12000,
    },
  });

  useEffect(() => {
    setDraft('');
  }, [lineId]);

  const secretHandle = lineData?.[4] as string | undefined;
  const decryptedSecret = secrets[lineId];
  const messages = useMemo(() => {
    const count = asNumber(messageCount);
    return Array.from({ length: count }, (_, index) => index);
  }, [messageCount]);

  const canSend = Boolean(isMember) && decryptedSecret && draft.trim().length > 0;

  return (
    <section className="line-room">
      <div className="line-room-header">
        <div>
          <p className="eyebrow">Active line</p>
          <h2>{(lineData?.[0] as string) || `Line #${lineId}`}</h2>
          <p className="line-meta">
            <span>Members {asNumber(lineData?.[3])}</span>
            <span>Created {formatTimestamp(lineData?.[2])}</span>
          </p>
        </div>
        <div className="secret-panel">
          <span className="secret-label">Secret A</span>
          <p className="secret-value">{decryptedSecret ? decryptedSecret : 'Locked'}</p>
          <button
            className="ghost-button"
            type="button"
            onClick={() => secretHandle && onDecrypt(lineId, secretHandle)}
            disabled={!address || !isMember || !secretHandle || decryptingLineId === lineId}
          >
            {decryptingLineId === lineId ? 'Decrypting…' : 'Decrypt Secret'}
          </button>
        </div>
      </div>

      <div className="message-list">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Decrypt A, encrypt your first message, and send it.</p>
          </div>
        ) : (
          messages.map((messageId) => (
            <LineMessage
              key={`${lineId}-${messageId}`}
              lineId={lineId}
              messageId={messageId}
              hasContract={hasContract}
              secret={decryptedSecret}
            />
          ))
        )}
      </div>

      <div className="compose-panel">
        <div className="compose-header">
          <span>Compose encrypted message</span>
          <span>{decryptedSecret ? 'A ready' : 'Decrypt A to send'}</span>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message that will be encrypted with A."
          rows={3}
          className="compose-input"
        />
        <div className="compose-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!canSend || sending}
            onClick={() => {
              if (!decryptedSecret) {
                return;
              }
              const plaintext = draft.trim();
              const encrypted = encryptMessage(plaintext, decryptedSecret);
              onSend(lineId, encrypted, plaintext);
              setDraft('');
            }}
          >
            {sending ? 'Sending…' : 'Encrypt & Send'}
          </button>
          <div className="compose-status">
            {!address && <span>Connect wallet to send.</span>}
            {address && !isMember && <span>Join this line to send.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LineApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [lineName, setLineName] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lineSecrets, setLineSecrets] = useState<LineSecrets>({});
  const [creating, setCreating] = useState(false);
  const [joiningLineId, setJoiningLineId] = useState<number | null>(null);
  const [decryptingLineId, setDecryptingLineId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const hasContract = true;

  const { data: lineCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLineCount',
    query: {
      enabled: hasContract,
      refetchInterval: 12000,
    },
  });

  const lineIds = useMemo(() => {
    const count = asNumber(lineCount);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [lineCount]);

  useEffect(() => {
    if (!selectedLineId && lineIds.length > 0) {
      setSelectedLineId(lineIds[lineIds.length - 1]);
    }
  }, [lineIds, selectedLineId]);

  const handleCreateLine = async (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    if (!address || !signerPromise) {
      setStatusMessage('Connect your wallet to create a line.');
      return;
    }
    if (!lineName.trim()) {
      setStatusMessage('Line name cannot be empty.');
      return;
    }
    if (!hasContract) {
      setStatusMessage('Contract address is not configured.');
      return;
    }
    setCreating(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }
      const lineContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await lineContract.createLine(lineName.trim());
      await tx.wait();
      setLineName('');
      setStatusMessage('Line created. Encrypting secret on-chain.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to create line.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinLine = async (lineId: number) => {
    setStatusMessage(null);
    if (!address || !signerPromise) {
      setStatusMessage('Connect your wallet to join.');
      return;
    }
    if (!hasContract) {
      setStatusMessage('Contract address is not configured.');
      return;
    }
    setJoiningLineId(lineId);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }
      const lineContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await lineContract.joinLine(lineId);
      await tx.wait();
      setStatusMessage(`Joined Line #${lineId}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to join line.');
    } finally {
      setJoiningLineId(null);
    }
  };

  const handleDecryptSecret = async (lineId: number, secretHandle: string) => {
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Connect wallet and initialize the relayer to decrypt.');
      return;
    }
    setDecryptingLineId(lineId);
    setStatusMessage(null);
    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: secretHandle,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decrypted = result[secretHandle];
      const secretNumber = asNumber(decrypted);

      setLineSecrets((prev) => ({
        ...prev,
        [lineId]: secretNumber,
      }));
      setStatusMessage(`Secret A decrypted for Line #${lineId}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to decrypt secret.');
    } finally {
      setDecryptingLineId(null);
    }
  };

  const handleSendMessage = async (lineId: number, encryptedMessage: string, plaintext: string) => {
    if (!address || !signerPromise) {
      setStatusMessage('Connect your wallet to send messages.');
      return;
    }
    if (!hasContract) {
      setStatusMessage('Contract address is not configured.');
      return;
    }
    if (!plaintext) {
      setStatusMessage('Message cannot be empty.');
      return;
    }
    setSending(true);
    setStatusMessage(null);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }
      const lineContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await lineContract.sendMessage(lineId, encryptedMessage);
      await tx.wait();
      setStatusMessage('Message delivered.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="line-app">
      <Header />
      <main className="line-main">
        <section className="line-creation">
          <div className="panel-header">
            <p className="eyebrow">Create a line</p>
            <h2>Spin up a private room</h2>
            <p className="panel-subtitle">
              Each line generates a fresh 8-digit secret A, encrypted on-chain with Zama FHE.
            </p>
          </div>
          <form className="line-form" onSubmit={handleCreateLine}>
            <input
              type="text"
              value={lineName}
              onChange={(event) => setLineName(event.target.value)}
              placeholder="Line name"
              className="text-input"
              maxLength={40}
            />
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create Line'}
            </button>
          </form>
          <div className="panel-footer">
            {zamaLoading && <span>Initializing relayer…</span>}
            {zamaError && <span>{zamaError}</span>}
            {statusMessage && <span>{statusMessage}</span>}
            {!hasContract && <span>Update the contract address before using the app.</span>}
          </div>
        </section>

        <section className="line-directory">
          <div className="panel-header">
            <p className="eyebrow">Browse</p>
            <h2>Live lines</h2>
            <p className="panel-subtitle">Join to unlock the encrypted secret A.</p>
          </div>
          <div className="line-list">
            {lineIds.length === 0 ? (
              <div className="empty-state">
                <p>No lines yet. Create the first one.</p>
              </div>
            ) : (
              lineIds.map((lineId) => (
                <LineCard
                  key={lineId}
                  lineId={lineId}
                  active={selectedLineId === lineId}
                  address={address}
                  hasContract={hasContract}
                  onSelect={setSelectedLineId}
                  onJoin={handleJoinLine}
                  isJoining={joiningLineId === lineId}
                />
              ))
            )}
          </div>
        </section>

        <section className="line-room-wrapper">
          {selectedLineId ? (
            <LineRoom
              lineId={selectedLineId}
              address={address}
              hasContract={hasContract}
              secrets={lineSecrets}
              decryptingLineId={decryptingLineId}
              onDecrypt={handleDecryptSecret}
              onSend={handleSendMessage}
              sending={sending}
            />
          ) : (
            <div className="empty-state wide">
              <p>Select a line to view encrypted messages.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
