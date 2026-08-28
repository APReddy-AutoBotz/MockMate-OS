import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const evidenceCleanupStatuses = new WeakMap();

export async function awaitParallelQuiescence(requests) {
  let firstFailure;
  let hasFailure = false;
  const settled = await Promise.all(requests.map(async (request) => {
    try {
      return { value: await request };
    } catch (error) {
      if (!hasFailure) {
        hasFailure = true;
        firstFailure = error;
      }
      return {};
    }
  }));

  if (hasFailure) throw firstFailure;
  return settled.map(({ value }) => value);
}

function sha256File(filePath, fileSystem) {
  const persisted = fileSystem.readFileSync(filePath);
  try {
    return crypto.createHash('sha256').update(persisted).digest('hex');
  } finally {
    if (Buffer.isBuffer(persisted)) persisted.fill(0);
  }
}

export function finalizeOwnedEvidence({
  artifactPath,
  evidence,
  fileSystem = fs,
  hashFile = sha256File,
}) {
  let serialized;
  let descriptor;
  let ownsArtifact = false;
  try {
    serialized = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fileSystem.mkdirSync(path.dirname(artifactPath), { recursive: true });
    descriptor = fileSystem.openSync(artifactPath, 'wx', 0o600);
    ownsArtifact = true;
    fileSystem.writeFileSync(descriptor, serialized);
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    return hashFile(artifactPath, fileSystem);
  } catch (error) {
    let cleanupIncomplete = false;
    if (descriptor !== undefined) {
      try { fileSystem.closeSync(descriptor); } catch { cleanupIncomplete = true; }
      descriptor = undefined;
    }
    if (ownsArtifact) {
      try {
        fileSystem.unlinkSync(artifactPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT') cleanupIncomplete = true;
      }
    }

    const propagated = error instanceof Error ? error : new Error('Evidence finalization failed.');
    evidenceCleanupStatuses.set(
      propagated,
      ownsArtifact ? (cleanupIncomplete ? 'incomplete' : 'complete') : 'not-owned',
    );
    throw propagated;
  } finally {
    serialized?.fill(0);
  }
}

export function evidenceCleanupStatus(error) {
  return error instanceof Error ? evidenceCleanupStatuses.get(error) : undefined;
}
