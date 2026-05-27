// Shows a message when user is not authorised to access a dataset.
// Used when `restricted` flag is true (backend controlled).
import React from "react";

function RestrictedAccessMessage() {
    return (
        <div
            style={{
                padding: "16px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                backgroundColor: "#f7f7f7",
                color: "#666",
                fontSize: "14px"
            }}
        >
            You are not authorised to access this dataset.
        </div>
    );
}

export default RestrictedAccessMessage;
