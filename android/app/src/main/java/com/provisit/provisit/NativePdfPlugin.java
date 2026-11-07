package com.provisit.provisit;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "NativePdf")
public class NativePdfPlugin extends Plugin {
    @PluginMethod
    public void savePdf(PluginCall call) {
        String filename = call.getString("filename");
        String base64 = call.getString("data");

        if (filename == null || base64 == null || base64.isEmpty()) {
            call.reject("Le fichier PDF est vide ou son nom est manquant.");
            return;
        }

        if (!filename.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            filename += ".pdf";
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("L'enregistrement direct dans Téléchargements nécessite Android 10 ou supérieur.");
            return;
        }

        Uri uri = null;
        try {
            byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Graal");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            uri = getContext().getContentResolver().insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
            );
            if (uri == null) {
                throw new IllegalStateException("Android n'a pas pu créer le fichier.");
            }

            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) {
                    throw new IllegalStateException("Impossible d'écrire le fichier PDF.");
                }
                output.write(bytes);
                output.flush();
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, ready, null, null);

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("filename", filename);
            result.put("location", "Téléchargements/Graal");
            call.resolve(result);
        } catch (Exception error) {
            if (uri != null) {
                try {
                    getContext().getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) {}
            }
            call.reject("Impossible d'enregistrer le PDF sur cet appareil : " + error.getMessage(), error);
        }
    }
}
