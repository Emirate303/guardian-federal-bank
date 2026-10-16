import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import ProfileAvatar from "./ProfileAvatar";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET_NAME = "profile-photos";

type ProfilePictureEditorProps = {
  userId: string;
  name: string;
  imageUrl: string | null;
  imagePath: string | null;
  onSaved: (path: string, signedUrl: string) => void;
  onRemoved: () => void;
};

async function hasSupportedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function decodeImage(file: File) {
  return createImageBitmap(file);
}

function drawAvatarImage(image: ImageBitmap, zoom: number) {
  const side = Math.min(image.width, image.height) / zoom;
  const sourceX = (image.width - side) / 2;
  const sourceY = (image.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't prepare the picture.");

  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 512, 512);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Your browser couldn't prepare the picture."));
          return;
        }
        resolve(blob);
      },
      "image/png",
    );
  });
}

export default function ProfilePictureEditor({
  userId,
  name,
  imageUrl,
  imagePath,
  onSaved,
  onRemoved,
}: ProfilePictureEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setSelectedFile(null);
    setZoom(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setMessage("");
    setErrorMessage("");
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image. SVG and other file types aren't supported.");
      event.currentTarget.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("Choose an image smaller than 5 MB.");
      event.currentTarget.value = "";
      return;
    }

    try {
      if (!(await hasSupportedImageSignature(file))) {
        setErrorMessage("This file doesn't appear to be a valid JPEG, PNG, or WebP image.");
        event.currentTarget.value = "";
        return;
      }
      const bitmap = await decodeImage(file);
      const validDimensions =
        bitmap.width > 0 &&
        bitmap.height > 0 &&
        bitmap.width <= 12000 &&
        bitmap.height <= 12000;
      bitmap.close();
      if (!validDimensions) {
        setErrorMessage("Choose a valid image no larger than 12,000 pixels per side.");
        event.currentTarget.value = "";
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(file);
      previewUrlRef.current = nextPreviewUrl;
      setSelectedFile(file);
      setPreviewUrl(nextPreviewUrl);
      setZoom(1);
    } catch (error) {
      console.error("Unable to preview the selected profile picture.", error);
      setErrorMessage("This image couldn't be opened. Choose another picture.");
      event.currentTarget.value = "";
    }
  }

  async function savePicture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || !previewUrl) return;

    setBusy(true);
    setMessage("");
    setErrorMessage("");
    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await decodeImage(selectedFile);
      const imageBlob = await drawAvatarImage(bitmap, zoom);
      bitmap.close();
      bitmap = null;
      const path = `${userId}/avatar.png`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, imageBlob, {
          cacheControl: "3600",
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error("Unable to upload the profile picture.", uploadError);
        setErrorMessage("Your picture couldn't be uploaded. Please try again.");
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", userId)
        .select("id")
        .single();

      if (profileError) {
        console.error("Unable to save the profile picture path.", profileError);
        setErrorMessage("Your picture was uploaded but couldn't be linked to your profile. Please try again.");
        return;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(path, 60 * 60 * 24 * 7);

      if (signedUrlError) {
        console.error("Unable to create a profile picture preview URL.", signedUrlError);
        onSaved(path, "");
        setErrorMessage("Your picture was saved, but couldn't be displayed yet. Refresh the page to try again.");
        clearPreview();
        return;
      }

      onSaved(path, signedUrlData.signedUrl);
      clearPreview();
      setMessage("Your profile picture has been saved.");
    } catch (error) {
      console.error("Unable to save the profile picture.", error);
      setErrorMessage("Your picture couldn't be saved. Please try again.");
    } finally {
      bitmap?.close();
      setBusy(false);
    }
  }

  async function removePicture() {
    if (!imagePath) return;
    if (!window.confirm("Remove your profile picture? Your initials will be shown instead.")) return;

    setBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", userId)
        .select("id")
        .single();

      if (profileError) {
        console.error("Unable to remove the profile picture from the profile.", profileError);
        setErrorMessage("Your profile picture couldn't be removed. Please try again.");
        return;
      }

      onRemoved();
      clearPreview();
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([imagePath]);

      if (storageError) {
        console.error("Unable to delete the removed profile picture from storage.", storageError);
        setMessage("Your picture was removed from your profile, but its stored file couldn't be deleted. Please contact support.");
        return;
      }

      setMessage("Your profile picture has been removed.");
    } catch (error) {
      console.error("Unable to remove the profile picture.", error);
      setErrorMessage("Your profile picture couldn't be removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel profile-picture-panel" aria-labelledby="profile-picture-heading">
      <div className="panel-header">
        <div>
          <h2 id="profile-picture-heading">Profile picture</h2>
          <p>Choose a picture that helps you recognize your account.</p>
        </div>
        <Camera size={21} aria-hidden="true" />
      </div>

      <div className="profile-picture-content">
        <div className="profile-picture-preview">
          {selectedFile && previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview of your selected profile picture"
              style={{ transform: `scale(${zoom})` }}
            />
          ) : (
            <ProfileAvatar
              name={name}
              imageUrl={imageUrl}
              className="profile-picture-avatar"
              size="large"
            />
          )}
        </div>

        <div className="profile-picture-controls">
          <p>Use a JPEG, PNG, or WebP image up to 5 MB. Your picture is cropped to a square and shown as a circle.</p>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a profile picture"
            onChange={(event) => void handleFileChange(event)}
          />
          <div className="profile-picture-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={16} />
              {imageUrl ? "Choose a new picture" : "Choose picture"}
            </button>
            {imagePath && !selectedFile && (
              <button
                type="button"
                className="danger-button"
                onClick={() => void removePicture()}
                disabled={busy}
              >
                <Trash2 size={16} />
                Remove picture
              </button>
            )}
          </div>

          {selectedFile && previewUrl && (
            <form className="profile-picture-editor" onSubmit={savePicture}>
              <label className="profile-picture-zoom">
                <span>Adjust crop</span>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Adjust picture crop zoom"
                />
              </label>
              <div className="profile-picture-actions">
                <button type="button" className="button-secondary" onClick={clearPreview} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={busy}>
                  {busy ? "Saving picture…" : "Save picture"}
                </button>
              </div>
            </form>
          )}

          {busy && <p className="profile-picture-saving" role="status">Saving your picture securely…</p>}
          {message && <p className="profile-picture-message" role="status">{message}</p>}
          {errorMessage && <p className="profile-picture-message error" role="alert">{errorMessage}</p>}
        </div>
      </div>
    </section>
  );
}
