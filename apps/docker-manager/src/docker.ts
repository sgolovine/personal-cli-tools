import { execFile } from "node:child_process";

export type ContainerItem = {
  id: string;
  key: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
};

export type ImageItem = {
  id: string;
  key: string;
  reference: string;
  size: string;
  created: string;
  inUse: boolean;
  deletionTarget: string;
};

export type VolumeItem = {
  key: string;
  name: string;
  driver: string;
  scope: string;
  inUse: boolean;
};

export type DockerSnapshot = {
  containers: ContainerItem[];
  images: ImageItem[];
  volumes: VolumeItem[];
};

type ContainerRow = {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
};

type ImageRow = {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedSince: string;
};

type VolumeRow = {
  Name: string;
  Driver: string;
  Scope: string;
};

type Mount = {
  Type?: string;
  Name?: string;
};

type ContainerReference = {
  running: boolean;
  imageId: string;
  mounts: Mount[];
};

const JSON_FORMAT = "{{json .}}";

function docker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }

        const detail = stderr.trim() || error.message;
        reject(new Error(detail));
      },
    );
  });
}

function parseRows<T>(output: string): T[] {
  if (!output.trim()) {
    return [];
  }

  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

async function inspectContainerReferences(
  ids: string[],
): Promise<Map<string, ContainerReference>> {
  if (ids.length === 0) {
    return new Map();
  }

  const format = [
    "{{json .Id}}",
    "{{json .State.Running}}",
    "{{json .Image}}",
    "{{json .Mounts}}",
  ].join("\t");
  const output = await docker([
    "container",
    "inspect",
    "--format",
    format,
    ...ids,
  ]);
  const references = new Map<string, ContainerReference>();

  for (const line of output.trim().split("\n")) {
    if (!line) {
      continue;
    }

    const [rawId, rawRunning, rawImageId, rawMounts] = line.split("\t");
    if (!rawId || !rawRunning || !rawImageId || !rawMounts) {
      throw new Error(
        "Docker returned an unexpected container inspection response",
      );
    }

    references.set(JSON.parse(rawId) as string, {
      running: JSON.parse(rawRunning) as boolean,
      imageId: JSON.parse(rawImageId) as string,
      mounts: JSON.parse(rawMounts) as Mount[],
    });
  }

  return references;
}

export async function loadDockerSnapshot(): Promise<DockerSnapshot> {
  const [containerOutput, imageOutput, volumeOutput] = await Promise.all([
    docker(["container", "ls", "--all", "--no-trunc", "--format", JSON_FORMAT]),
    docker(["image", "ls", "--all", "--no-trunc", "--format", JSON_FORMAT]),
    docker(["volume", "ls", "--format", JSON_FORMAT]),
  ]);

  const containerRows = parseRows<ContainerRow>(containerOutput);
  const imageRows = parseRows<ImageRow>(imageOutput);
  const volumeRows = parseRows<VolumeRow>(volumeOutput);
  const references = await inspectContainerReferences(
    containerRows.map((container) => container.ID),
  );
  const usedImages = new Set<string>();
  const usedVolumes = new Set<string>();

  for (const reference of references.values()) {
    usedImages.add(reference.imageId);
    for (const mount of reference.mounts) {
      if (mount.Type === "volume" && mount.Name) {
        usedVolumes.add(mount.Name);
      }
    }
  }

  return {
    containers: containerRows.map((container) => ({
      id: container.ID,
      key: container.ID,
      name: container.Names,
      image: container.Image,
      status: container.Status,
      running:
        references.get(container.ID)?.running ?? container.State === "running",
    })),
    images: imageRows.map((image) => {
      const tagged = image.Repository !== "<none>" && image.Tag !== "<none>";
      const reference = tagged ? `${image.Repository}:${image.Tag}` : "<none>";

      return {
        id: shortId(image.ID),
        key: `${image.ID}:${reference}`,
        reference,
        size: image.Size,
        created: image.CreatedSince,
        inUse: usedImages.has(image.ID),
        deletionTarget: tagged ? reference : image.ID,
      };
    }),
    volumes: volumeRows.map((volume) => ({
      key: volume.Name,
      name: volume.Name,
      driver: volume.Driver,
      scope: volume.Scope,
      inUse: usedVolumes.has(volume.Name),
    })),
  };
}

export async function stopContainer(id: string): Promise<void> {
  await docker(["container", "stop", id]);
}

export async function deleteContainer(id: string): Promise<void> {
  await docker(["container", "rm", id]);
}

export async function deleteImage(target: string): Promise<void> {
  await docker(["image", "rm", target]);
}

export async function deleteVolume(name: string): Promise<void> {
  await docker(["volume", "rm", name]);
}
