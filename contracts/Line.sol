// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Line
/// @notice Confidential group chat that stores an encrypted 8-digit secret per line.
contract Line is ZamaEthereumConfig {
    struct LineMetadata {
        string name;
        address creator;
        uint256 createdAt;
        uint256 memberCount;
        bool exists;
    }

    struct Message {
        address sender;
        uint256 timestamp;
        string encryptedMessage;
    }

    uint256 private _lineCount;
    mapping(uint256 => LineMetadata) private _lines;
    mapping(uint256 => euint32) private _lineSecrets;
    mapping(uint256 => mapping(address => bool)) private _members;
    mapping(uint256 => Message[]) private _messages;

    event LineCreated(uint256 indexed lineId, address indexed creator, string name);
    event LineJoined(uint256 indexed lineId, address indexed member);
    event MessageSent(uint256 indexed lineId, uint256 indexed messageId, address indexed sender);

    error LineNotFound(uint256 lineId);
    error AlreadyMember(address member);
    error NotMember(address member);
    error EmptyName();
    error EmptyMessage();

    /// @notice Create a new line with a random encrypted 8-digit secret.
    function createLine(string calldata name) external returns (uint256 lineId) {
        if (bytes(name).length == 0) {
            revert EmptyName();
        }

        lineId = ++_lineCount;
        _lines[lineId] = LineMetadata({
            name: name,
            creator: msg.sender,
            createdAt: block.timestamp,
            memberCount: 1,
            exists: true
        });
        _members[lineId][msg.sender] = true;

        euint32 randomBase = FHE.randEuint32(90000000);
        euint32 secret = FHE.add(randomBase, 10000000);
        _lineSecrets[lineId] = secret;

        FHE.allowThis(secret);
        FHE.allow(secret, msg.sender);

        emit LineCreated(lineId, msg.sender, name);
    }

    /// @notice Join an existing line to gain decryption access for its secret.
    function joinLine(uint256 lineId) external {
        LineMetadata storage metadata = _lines[lineId];
        if (!metadata.exists) {
            revert LineNotFound(lineId);
        }
        if (_members[lineId][msg.sender]) {
            revert AlreadyMember(msg.sender);
        }

        _members[lineId][msg.sender] = true;
        metadata.memberCount += 1;

        FHE.allow(_lineSecrets[lineId], msg.sender);

        emit LineJoined(lineId, msg.sender);
    }

    /// @notice Send an encrypted message to a line.
    function sendMessage(uint256 lineId, string calldata encryptedMessage) external {
        if (!_lines[lineId].exists) {
            revert LineNotFound(lineId);
        }
        if (!_members[lineId][msg.sender]) {
            revert NotMember(msg.sender);
        }
        if (bytes(encryptedMessage).length == 0) {
            revert EmptyMessage();
        }

        _messages[lineId].push(
            Message({sender: msg.sender, timestamp: block.timestamp, encryptedMessage: encryptedMessage})
        );

        emit MessageSent(lineId, _messages[lineId].length - 1, msg.sender);
    }

    /// @notice Returns the total number of lines.
    function getLineCount() external view returns (uint256) {
        return _lineCount;
    }

    /// @notice Returns metadata and encrypted secret for a line.
    function getLine(
        uint256 lineId
    )
        external
        view
        returns (string memory name, address creator, uint256 createdAt, uint256 memberCount, euint32 secret)
    {
        LineMetadata storage metadata = _lines[lineId];
        if (!metadata.exists) {
            revert LineNotFound(lineId);
        }

        return (metadata.name, metadata.creator, metadata.createdAt, metadata.memberCount, _lineSecrets[lineId]);
    }

    /// @notice Checks if an address is a member of a line.
    function isMember(uint256 lineId, address user) external view returns (bool) {
        if (!_lines[lineId].exists) {
            revert LineNotFound(lineId);
        }
        return _members[lineId][user];
    }

    /// @notice Returns the number of messages in a line.
    function getMessageCount(uint256 lineId) external view returns (uint256) {
        if (!_lines[lineId].exists) {
            revert LineNotFound(lineId);
        }
        return _messages[lineId].length;
    }

    /// @notice Returns a message by index.
    function getMessage(
        uint256 lineId,
        uint256 messageId
    ) external view returns (address sender, uint256 timestamp, string memory encryptedMessage) {
        if (!_lines[lineId].exists) {
            revert LineNotFound(lineId);
        }
        Message storage messageData = _messages[lineId][messageId];
        return (messageData.sender, messageData.timestamp, messageData.encryptedMessage);
    }
}
