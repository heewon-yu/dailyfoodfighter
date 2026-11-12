package com.dailyfoodfighter.scalpingking;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

@CapacitorPlugin(name = "ScalpScoreShare")
public class ScalpScoreSharePlugin extends Plugin {
    private static final int MAX_ENCODED_LENGTH = 2_000_000;
    private static final long CACHE_MAX_AGE = 24 * 60 * 60_000L;

    @PluginMethod
    public void sharePng(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null || encoded.isEmpty() || encoded.length() > MAX_ENCODED_LENGTH) {
            call.reject("Invalid score image size");
            return;
        }
        try {
            byte[] image = Base64.decode(encoded, Base64.NO_WRAP);
            if (image.length < 8 || image[0] != (byte) 0x89 ||
                image[1] != 0x50 || image[2] != 0x4e || image[3] != 0x47 ||
                image[4] != 0x0d || image[5] != 0x0a || image[6] != 0x1a || image[7] != 0x0a) {
                call.reject("Invalid PNG");
                return;
            }
            File directory = new File(getContext().getCacheDir(), "score-share");
            if (!directory.isDirectory() && !directory.mkdirs()) {
                throw new IOException("Cannot create score cache");
            }
            File[] previous = directory.listFiles();
            if (previous != null) {
                long expiry = System.currentTimeMillis() - CACHE_MAX_AGE;
                for (File item : previous) {
                    if (item.isFile() && item.lastModified() < expiry) item.delete();
                }
            }
            File score = File.createTempFile("scalping-king-", ".png", directory);
            try (FileOutputStream output = new FileOutputStream(score)) {
                output.write(image);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", score);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newUri(getContext().getContentResolver(), "5분 단타왕 성적표", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(Intent.createChooser(send, "성적표 공유"));
                    call.resolve();
                } catch (RuntimeException error) {
                    call.reject("Android share menu could not open", error);
                }
            });
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Could not prepare score image", error);
        }
    }
}
