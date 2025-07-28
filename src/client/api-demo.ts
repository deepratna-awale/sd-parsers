/**
 * SD-Parsers API Demo Client
 * Handles all client-side interactions for the demo interface
 */

type ApiResponse = {
  success: boolean;
  data: {
    prompts?: Array<{
      value: string;
      isNegative: boolean;
    }>;
    parameters?: {
      sampler?: string;
      steps?: number;
      cfgScale?: number;
      seed?: number;
      size?: {
        width: number;
        height: number;
      };
    };
    generator?: string;
  };
  metadata?: {
    filename?: string;
    size?: number;
    mimetype?: string;
    eagerness?: string;
    url?: string;
  };
};

class ApiDemo {
  private apiBase = "";

  constructor() {
    this.init();
  }

  /**
   * Initialize the demo application
   */
  private init(): void {
    // Load saved endpoint or use default
    const savedEndpoint = localStorage.getItem("sd-parsers-api-endpoint");
    this.apiBase = savedEndpoint || this.getDefaultApiEndpoint();

    const endpointInput = document.getElementById("apiEndpointInput") as HTMLInputElement;
    if (endpointInput) {
      endpointInput.value = this.apiBase;
    }

    this.setupEventListeners();
    this.checkApiStatus();
  }

  /**
   * Auto-detect API endpoint based on current location
   */
  private getDefaultApiEndpoint(): string {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:3000/api";
    }
    else {
      // For production, try to use the same protocol and host
      return `${window.location.protocol}//${window.location.host}/api`;
    }
  }

  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    // API endpoint controls
    const updateBtn = document.querySelector("[data-action=\"update-endpoint\"]");
    const testBtn = document.querySelector("[data-action=\"test-api\"]");

    updateBtn?.addEventListener("click", () => this.updateApiEndpoint());
    testBtn?.addEventListener("click", () => this.checkApiStatus());

    // Docs link
    const docsLink = document.getElementById("docsLink");
    docsLink?.addEventListener("click", e => this.handleDocsLink(e));

    // Clear buttons
    document.querySelectorAll("[data-action=\"clear-results\"]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).dataset.target;
        if (target)
          this.clearResults(target);
      });
    });

    // Example URL buttons
    document.querySelectorAll("[data-action=\"load-example\"]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const url = (e.target as HTMLElement).dataset.url;
        if (url)
          this.loadExampleUrl(url);
      });
    });

    // Form submissions
    const fileForm = document.getElementById("fileUploadForm");
    const urlForm = document.getElementById("urlParseForm");

    fileForm?.addEventListener("submit", e => this.handleFileUpload(e));
    urlForm?.addEventListener("submit", e => this.handleUrlParse(e));

    // Drag and drop for file upload
    this.setupDragAndDrop();
  }

  /**
   * Update API endpoint
   */
  private updateApiEndpoint(): void {
    const input = document.getElementById("apiEndpointInput") as HTMLInputElement;
    const newEndpoint = input.value.trim();

    if (!newEndpoint) {
      // eslint-disable-next-line no-alert
      alert("Please enter a valid API endpoint");
      return;
    }

    this.apiBase = newEndpoint.replace(/\/$/, ""); // Remove trailing slash
    localStorage.setItem("sd-parsers-api-endpoint", this.apiBase);

    // Update display and test connection
    this.checkApiStatus();
  }

  /**
   * Handle docs link click
   */
  private handleDocsLink(e: Event): void {
    e.preventDefault();

    // Construct the docs URL based on current API endpoint
    let docsUrl: string;

    if (this.apiBase.includes("localhost") || this.apiBase.includes("127.0.0.1")) {
      // For local development, construct docs URL from the base
      const baseUrl = this.apiBase.replace("/api", "");
      docsUrl = `${baseUrl}/api/docs`;
    }
    else {
      // For production or other environments, use current host
      docsUrl = `${window.location.protocol}//${window.location.host}/api/docs`;
    }

    // Open docs in a new tab
    window.open(docsUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * Check API status
   */
  private async checkApiStatus(): Promise<boolean> {
    const statusIndicator = document.getElementById("apiStatus");
    const statusText = document.getElementById("apiStatusText");

    if (!statusIndicator || !statusText)
      return false;

    statusIndicator.className = "status-indicator";
    statusText.textContent = "Checking...";

    try {
      const response = await fetch(`${this.apiBase}/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "ok") {
          statusIndicator.className = "status-indicator status-online";
          statusText.textContent = `API Online (${data.version || "v1.0.0"})`;
          return true;
        }
      }
      throw new Error(`HTTP ${response.status}`);
    }
    catch (error) {
      statusIndicator.className = "status-indicator status-offline";
      statusText.textContent = `API Offline - ${(error as Error).message}`;
      console.error("API status check failed:", error);
      return false;
    }
  }

  /**
   * Load example URL into the URL input field
   */
  private loadExampleUrl(url: string): void {
    const urlInput = document.getElementById("imageUrl") as HTMLInputElement;
    if (urlInput) {
      urlInput.value = url;
    }
  }

  /**
   * Handle file upload form submission
   */
  private async handleFileUpload(e: Event): Promise<void> {
    e.preventDefault();

    const fileInput = document.getElementById("imageFile") as HTMLInputElement;
    const eagerness = (document.getElementById("eagernessFile") as HTMLSelectElement).value;
    const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;

    if (!fileInput.files?.[0]) {
      this.showError("fileResults", "Please select a file first.");
      return;
    }

    // Check API status first
    const apiOnline = await this.checkApiStatus();
    if (!apiOnline) {
      this.showError("fileResults", "API is not available. Please check the API endpoint configuration.");
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Processing...";
    this.showLoading("fileResults");

    try {
      const formData = new FormData();
      formData.append("image", fileInput.files[0]);
      formData.append("eagerness", eagerness);

      const response = await fetch(`${this.apiBase}/parse`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: ApiResponse = await response.json();
      const resultsElement = document.getElementById("fileResults");
      if (resultsElement) {
        resultsElement.innerHTML = this.formatMetadata(result, result.metadata);
      }
    }
    catch (error) {
      this.showError("fileResults", `Failed to parse image: ${(error as Error).message}`);
    }
    finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Parse Image";
    }
  }

  /**
   * Handle URL parse form submission
   */
  private async handleUrlParse(e: Event): Promise<void> {
    e.preventDefault();

    const urlInput = document.getElementById("imageUrl") as HTMLInputElement;
    const eagerness = (document.getElementById("eagernessUrl") as HTMLSelectElement).value;
    const urlBtn = document.getElementById("urlBtn") as HTMLButtonElement;

    if (!urlInput.value.trim()) {
      this.showError("urlResults", "Please enter a URL first.");
      return;
    }

    // Check API status first
    const apiOnline = await this.checkApiStatus();
    if (!apiOnline) {
      this.showError("urlResults", "API is not available. Please check the API endpoint configuration.");
      return;
    }

    urlBtn.disabled = true;
    urlBtn.textContent = "Processing...";
    this.showLoading("urlResults");

    try {
      const response = await fetch(`${this.apiBase}/parse/url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: urlInput.value.trim(),
          eagerness,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: ApiResponse = await response.json();
      const resultsElement = document.getElementById("urlResults");
      if (resultsElement) {
        resultsElement.innerHTML = this.formatMetadata(result, result.metadata);
      }
    }
    catch (error) {
      this.showError("urlResults", `Failed to parse URL: ${(error as Error).message}`);
    }
    finally {
      urlBtn.disabled = false;
      urlBtn.textContent = "Parse URL";
    }
  }

  /**
   * Format metadata for display
   */
  private formatMetadata(data: ApiResponse, metadata?: ApiResponse["metadata"]): string {
    let html = "";

    if (data && data.success) {
      html += "<div class=\"success\"><h3>✅ Metadata Successfully Extracted!</h3></div>";

      // Prompts
      if (data.data.prompts && data.data.prompts.length > 0) {
        html += "<div class=\"prompts\"><h4>📝 Prompts Found:</h4>";
        data.data.prompts.forEach((prompt) => {
          const className = prompt.isNegative ? "prompt-item prompt-negative" : "prompt-item";
          const label = prompt.isNegative ? "[NEGATIVE]" : "[POSITIVE]";
          html += `<div class="${className}"><strong>${label}</strong> ${this.escapeHtml(prompt.value)}</div>`;
        });
        html += "</div>";
      }

      // Parameters
      if (data.data.parameters) {
        html += "<div class=\"parameters\"><h4>⚙️ Generation Parameters:</h4><div class=\"param-grid\">";
        const params = data.data.parameters;

        if (params.sampler)
          html += `<div class="param-item"><strong>Sampler:</strong> ${this.escapeHtml(params.sampler)}</div>`;
        if (params.steps)
          html += `<div class="param-item"><strong>Steps:</strong> ${params.steps}</div>`;
        if (params.cfgScale)
          html += `<div class="param-item"><strong>CFG Scale:</strong> ${params.cfgScale}</div>`;
        if (params.seed)
          html += `<div class="param-item"><strong>Seed:</strong> ${params.seed}</div>`;
        if (params.size)
          html += `<div class="param-item"><strong>Size:</strong> ${params.size.width}×${params.size.height}</div>`;
        if (data.data.generator)
          html += `<div class="param-item"><strong>Generator:</strong> ${this.escapeHtml(data.data.generator)}</div>`;

        html += "</div></div>";
      }
    }
    else {
      html += "<div class=\"error\"><h3>❌ No AI Generation Metadata Found</h3>";
      html
        += "<p>This image does not contain recognizable AI generation metadata, or the metadata format is not supported.</p></div>";
    }

    // File metadata
    if (metadata) {
      html += "<div class=\"metadata\"><h4>📊 File Information:</h4>";
      if (metadata.filename)
        html += `<div class="metadata-item"><strong>Filename:</strong> ${this.escapeHtml(metadata.filename)}</div>`;
      if (metadata.size)
        html += `<div class="metadata-item"><strong>File Size:</strong> ${this.formatFileSize(metadata.size)}</div>`;
      if (metadata.mimetype)
        html += `<div class="metadata-item"><strong>MIME Type:</strong> ${this.escapeHtml(metadata.mimetype)}</div>`;
      if (metadata.mimetype && !["image/jpeg", "image/png"].includes(metadata.mimetype)) {
        html += `<div class="metadata-item error"><strong>Warning:</strong> Only JPEG and PNG formats are supported.</div>`;
      }
      if (metadata.eagerness) {
        html += `<div class="metadata-item"><strong>Eagerness Level:</strong> ${this.escapeHtml(
          metadata.eagerness,
        )}</div>`;
      }
      if (metadata.url) {
        html += `<div class="metadata-item"><strong>Source URL:</strong> <a href="${this.escapeHtml(
          metadata.url,
        )}" target="_blank" rel="noopener">${this.escapeHtml(metadata.url)}</a></div>`;
      }
      html += "</div>";
    }

    // Raw JSON (collapsible)
    html
      += "<details style=\"margin-top: 15px;\"><summary style=\"cursor: pointer; font-weight: bold; color: #4facfe;\">📄 Raw JSON Response</summary>";
    html += "<div class=\"json-output\">";
    html += this.escapeHtml(JSON.stringify(data, null, 2));
    html += "</div></details>";

    return html;
  }

  /**
   * Clear results display
   */
  private clearResults(elementId: string): void {
    const element = document.getElementById(elementId);
    if (!element)
      return;

    const isFile = elementId === "fileResults";
    element.innerHTML = isFile
      ? "<h3>📋 Upload an image file to see its metadata here...</h3>"
      : "<h3>🔗 Enter an image URL to see its metadata here...</h3>";
  }

  /**
   * Show loading state
   */
  private showLoading(elementId: string): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = "<div class=\"loading\">🔄 Processing image, please wait...</div>";
    }
  }

  /**
   * Show error message
   */
  private showError(elementId: string, error: string): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="error"><h3>❌ Error</h3><p>${this.escapeHtml(error)}</p></div>`;
    }
  }

  /**
   * Setup drag and drop functionality
   */
  private setupDragAndDrop(): void {
    const fileInput = document.getElementById("imageFile") as HTMLInputElement;
    const fileForm = document.getElementById("fileUploadForm");

    if (!fileForm || !fileInput)
      return;

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      fileForm.addEventListener(eventName, this.preventDefaults, false);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      fileForm.addEventListener(eventName, () => this.highlight(fileForm), false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      fileForm.addEventListener(eventName, () => this.unhighlight(fileForm), false);
    });

    fileForm.addEventListener("drop", e => this.handleDrop(e, fileInput), false);
  }

  private preventDefaults(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private highlight(element: HTMLElement): void {
    element.style.background = "#e8f4fd";
  }

  private unhighlight(element: HTMLElement): void {
    element.style.background = "";
  }

  private handleDrop(e: DragEvent, fileInput: HTMLInputElement): void {
    const dt = e.dataTransfer;
    const files = dt?.files;

    if (files && files.length > 0) {
      fileInput.files = files;
    }
  }

  /**
   * Utility functions
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0)
      return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}

// Initialize the demo when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const demo = new ApiDemo();
  // Store demo instance globally for debugging if needed
  (window as any).apiDemo = demo;
});
