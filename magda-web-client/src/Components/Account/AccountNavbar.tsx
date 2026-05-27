import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { useSelector, useDispatch } from "react-redux";
import { StateType } from "../../reducers/reducer";
import {
    receiveWhoAmIUserInfo,
    requestWhoAmI
} from "../../actions/userManagementActions";
import { config } from "../../config";
import "./AccountNavbar.scss";

const DEMO_USERS = [
    { label: "Anonymous", username: "", password: "", id: "" },
    {
        label: "Regular User",
        username: "user@mitchc.live",
        password: "W9gvM5aT",
        id: "91c44be7-ea75-4429-8c79-e9149731fab0"
    },
    {
        label: "Admin",
        username: "admin@mitchc.live",
        password: "WMv93daM",
        id: "46b97384-b1ee-47f4-8e90-a21c9cbf91ed"
    }
];

type PropsType = {
    skipLink?: boolean;
};

const AccountNavbar: React.FC<PropsType> = ({ skipLink }) => {
    const dispatch = useDispatch();
    const currentUser = useSelector(
        (state: StateType) => state.userManagement.user
    );
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const dropdownRef = useRef<HTMLLIElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [dropdownPos, setDropdownPos] = useState<{
        top: number;
        left: number;
    }>({ top: 0, left: 0 });

    const currentLabel =
        DEMO_USERS.find((u) => u.id === currentUser?.id)?.label || "Anonymous";

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const switchUser = async (user: (typeof DEMO_USERS)[number]) => {
        setSwitching(true);
        try {
            if (!user.username) {
                await fetch(config.baseUrl + "auth/logout", {
                    ...config.commonFetchRequestOptions,
                    credentials: "include"
                });
                dispatch(
                    receiveWhoAmIUserInfo({
                        id: "",
                        displayName: "Anonymous User",
                        email: "",
                        photoURL: "",
                        source: "",
                        roles: [],
                        permissions: []
                    })
                );
            } else {
                const formData = new URLSearchParams();
                formData.append("username", user.username);
                formData.append("password", user.password);

                await fetch(config.baseUrl + "auth/login/plugin/internal", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: formData.toString(),
                    redirect: "manual"
                });
                await (dispatch as any)(requestWhoAmI());
            }
        } catch (e) {
            console.error("User switch failed:", e);
        } finally {
            setSwitching(false);
            setOpen(false);
        }
    };

    return (
        <li
            ref={dropdownRef}
            className="account-navbar"
            id={skipLink ? "nav" : undefined}
        >
            <button
                ref={triggerRef}
                className="account-navbar__trigger"
                onClick={() => {
                    if (!open && triggerRef.current) {
                        const rect = triggerRef.current.getBoundingClientRect();
                        setDropdownPos({
                            top: rect.bottom + 4,
                            left: rect.left
                        });
                    }
                    setOpen(!open);
                }}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <span>{currentLabel}</span>
                <span className="account-navbar__caret">&#9662;</span>
            </button>
            {open &&
                ReactDOM.createPortal(
                    <ul
                        className="account-navbar__dropdown"
                        style={{ top: dropdownPos.top, left: dropdownPos.left }}
                    >
                        {DEMO_USERS.map((user) => (
                            <li key={user.label}>
                                <button
                                    className={`account-navbar__option ${
                                        user.id === (currentUser?.id || "")
                                            ? "account-navbar__option--active"
                                            : ""
                                    }`}
                                    onClick={() => switchUser(user)}
                                    disabled={
                                        switching ||
                                        user.id === (currentUser?.id || "")
                                    }
                                >
                                    {user.label}
                                    {user.id === (currentUser?.id || "") && (
                                        <span className="account-navbar__check">
                                            &#10003;
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>,
                    document.body
                )}
        </li>
    );
};

export default AccountNavbar;
