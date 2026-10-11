import { el, isVisible, setVisible } from "./dom";

/** SIM activation: the player types their real phone number. */
export class PhoneForm {
  readonly root = el("div", "panel phoneform hidden");
  readonly input = el("input");
  private status = el("div", "small");
  onSubmit: (phone: string) => Promise<void> = async () => {};

  constructor(parent: HTMLElement) {
    this.root.id = "phone-form";
    this.input.type = "tel";
    this.input.placeholder = "+33 6 12 34 56 78";
    const form = el("form");
    form.append(this.input, el("button", "", "Activate"));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit(this.input.value).catch(() => {}); // error is shown in the status line
    });
    this.root.append(
      el("h3", "", "Activate your SIM"),
      el("div", "small", "Enter your real phone number. Luna will call you."),
      form,
      this.status,
    );
    parent.appendChild(this.root);
  }

  get open() {
    return isVisible(this.root);
  }

  show() {
    this.status.textContent = "";
    setVisible(this.root, true);
    this.input.focus();
  }

  close() {
    setVisible(this.root, false);
    this.input.blur();
  }

  async submit(phone: string) {
    this.status.textContent = "Activating…";
    try {
      await this.onSubmit(phone.trim());
      this.close();
    } catch (e) {
      this.status.textContent = `Could not activate: ${(e as Error).message}`;
      throw e;
    }
  }
}
