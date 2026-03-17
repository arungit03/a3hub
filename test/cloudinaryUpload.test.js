import assert from "node:assert/strict";
import test from "node:test";
import { uploadFileToCloudinary } from "../src/lib/cloudinaryUpload.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

const restoreGlobals = () => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
};

test("uploadFileToCloudinary throws a configuration error when runtime config is missing", async () => {
  restoreGlobals();

  await assert.rejects(
    () => uploadFileToCloudinary({ file: new Blob(["demo"]) }),
    (error) => {
      assert.equal(error?.code, "cloudinary/not-configured");
      assert.match(String(error?.message), /Cloud upload is not configured/i);
      return true;
    }
  );
});

test("uploadFileToCloudinary uploads using runtime config values", async () => {
  restoreGlobals();

  const requests = [];
  globalThis.window = {
    __A3HUB_RUNTIME_CONFIG__: {
      cloudinary: {
        cloudName: "demo-cloud",
        uploadPreset: "unsigned-preset",
      },
    },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        secure_url: "https://cdn.example.com/demo.pdf",
        public_id: "a3hub/demo",
        bytes: 1234,
        format: "pdf",
        resource_type: "raw",
      }),
    };
  };

  try {
    const file = new File(["demo"], "demo.txt", { type: "text/plain" });
    const result = await uploadFileToCloudinary({
      file,
      folder: "a3hub/tests",
    });

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      "https://api.cloudinary.com/v1_1/demo-cloud/auto/upload"
    );
    assert.equal(requests[0].options?.method, "POST");
    assert.equal(requests[0].options?.body?.get("upload_preset"), "unsigned-preset");
    assert.equal(requests[0].options?.body?.get("folder"), "a3hub/tests");
    assert.equal(requests[0].options?.body?.get("file")?.name, "demo.txt");

    assert.deepEqual(result, {
      url: "https://cdn.example.com/demo.pdf",
      publicId: "a3hub/demo",
      provider: "cloudinary",
      bytes: 1234,
      format: "pdf",
      resourceType: "raw",
    });
  } finally {
    restoreGlobals();
  }
});

test("uploadFileToCloudinary converts fetch failures into a user-facing network error", async () => {
  restoreGlobals();

  globalThis.window = {
    __A3HUB_CLOUDINARY_CONFIG__: {
      cloud_name: "demo-cloud",
      upload_preset: "unsigned-preset",
    },
  };
  globalThis.fetch = async () => {
    throw new Error("socket hang up");
  };

  try {
    await assert.rejects(
      () => uploadFileToCloudinary({ file: new Blob(["demo"]) }),
      (error) => {
        assert.equal(error?.code, "cloudinary/network-error");
        assert.match(String(error?.message), /Network issue while uploading file/i);
        return true;
      }
    );
  } finally {
    restoreGlobals();
  }
});
