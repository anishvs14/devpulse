import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Pagination } from "./Pagination";
import { SeverityBadge, StatusBadge } from "./badges";
import { AuthProvider } from "../context/AuthContext";
import { LoginPage } from "../pages/AuthPages";

describe("Pagination", () => {
  it("shows the range and disables Previous on the first page", () => {
    render(<Pagination page={1} size={15} total={40} onChange={() => {}} />);
    expect(screen.getByText("1–15 of 40")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next on the last page and calls onChange with the new page", async () => {
    const onChange = vi.fn();
    render(<Pagination page={3} size={15} total={40} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("copes with zero results", () => {
    render(<Pagination page={1} size={15} total={0} onChange={() => {}} />);
    expect(screen.getByText("0–0 of 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("badges", () => {
  it("render readable labels", () => {
    render(
      <>
        <SeverityBadge severity="SEV1" />
        <StatusBadge status="INVESTIGATING" />
      </>,
    );
    expect(screen.getByText("SEV1")).toBeInTheDocument();
    expect(screen.getByText("Investigating")).toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  function renderLogin() {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("shows the server's error message when credentials are wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: "Incorrect email or password" }),
      }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
    expect(localStorage.getItem("devpulse.token")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("stores the token and fetches the user after a successful login", async () => {
    const user = { id: "u1", email: "a@b.com", full_name: "Ann", role: "ENGINEER", is_active: true, created_at: "", updated_at: "" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ access_token: "jwt-1", token_type: "bearer" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(user) });
    vi.stubGlobal("fetch", fetchMock);
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(localStorage.getItem("devpulse.token")).toBe("jwt-1"));
    expect(fetchMock).toHaveBeenCalledTimes(2); // POST /auth/login, then GET /users/me
    vi.unstubAllGlobals();
  });
});
