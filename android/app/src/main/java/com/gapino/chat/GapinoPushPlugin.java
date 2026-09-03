package com.gapino.chat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "GapinoPush")
public class GapinoPushPlugin extends Plugin {

    @PluginMethod
    public void getToken(PluginCall call) {

        FirebaseMessaging
                .getInstance()
                .getToken()
                .addOnCompleteListener(task -> {

                    if (!task.isSuccessful()) {

                        call.reject(
                                "دریافت توکن اعلان انجام نشد.",
                                task.getException()
                        );

                        return;
                    }

                    String token =
                            task.getResult();

                    if (
                            token == null ||
                            token.trim().isEmpty()
                    ) {

                        call.reject(
                                "توکن اعلان خالی است."
                        );

                        return;
                    }

                    JSObject result =
                            new JSObject();

                    result.put(
                            "token",
                            token
                    );

                    call.resolve(
                            result
                    );
                });
    }
}