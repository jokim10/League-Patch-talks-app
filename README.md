# League Patch Pulse 📢

A high-fidelity, modern web application built using **Python Flask** and **Vanilla Web technologies (HTML, JavaScript, CSS)**. The application scrapes League of Legends patch notes, outlines balance adjustments into structured cards, analyzes/classifies changes, and compiles character-compliant posts for direct sharing to X/Twitter.

---

## 🌟 Key Features

* **Linear Preorder DOM Scraper:** Scrapes League of Legends patch notes and bypasses nested layout limitations by traversing headings (`h2`, `h3`, `h4`) in global document order.
* **Automatic Status Classifier:** Grades champion updates as a **Buff** (green `🟢`), **Nerf** (red `🔴`), or **Change/Adjustment** (yellow `🟡`) by scoring developer logs and evaluating numerical direction shifts.
* **Numeric Highlight Extractor:** Isolates exact statistical changes (e.g. `10 -> 12`) from long paragraphs, organizing them by skill key (e.g. `Q:`, `W:`, `Base Stats:`).
* **Smart Tweet Composer:** Drafts custom tweets containing patch tags, title details, description bullet points, and specific section anchors.
* **Auto-Fit Compression:** If a draft exceeds Twitter's 280-character limit, clicking **Auto-Fit** replaces the text description with the extracted list of numerical highlights, ensuring it fits under the limit.
* **Dynamic Category Filters:** Client-side filters (such as *Champions*, *Systems*, *ARAM*, *Arena*, *Skins*) are dynamically compiled based on section headings parsed from the active patch note page.
* **In-Memory Cache System:** Caches the parsed data for 10 minutes to minimize page loading times. Includes a header status tag and a running "Time Ago" counter.

---

## 🛠️ Technology Stack

* **Backend:** Python 3.12, Flask, requests, BeautifulSoup4
* **Frontend:** Vanilla HTML5, Vanilla CSS3 (Glassmorphism, custom scrollbars, keyframe animations), Vanilla JavaScript (ES6, dynamic DOM parsing)

---

## 📂 Project Structure

```text
League-Patch-talks-app/
│
├── app.py                # Core Flask server, scraper algorithms, and status classifier
├── .gitignore            # Standard ignore paths (venv, cache, IDE files)
├── README.md             # Project documentation (this file)
│
├── templates/
│   └── index.html        # Main HTML layout and structural components
│
└── static/
    ├── css/
    │   └── style.css     # Styling tokens, responsive grid, Glassmorphism, animations
    └── js/
        └── app.js        # DOM events, API handlers, filtering, composer, character count
```

---

## 🚀 Getting Started

### Prerequisites
* Python 3.12 or higher
* Git (optional, for repository management)

### Installation
1. Clone or navigate to the project root directory:
   ```bash
   cd "Kaggle Day2 project"
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   * **Windows (PowerShell):**
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **macOS / Linux:**
     ```bash
     source venv/bin/activate
     ```

4. Install the required dependencies:
   ```bash
   pip install flask requests beautifulsoup4
   ```

### Running the Application
1. Start the Flask development server:
   ```bash
   python app.py
   ```

2. Open your web browser and navigate to:
   ```text
   http://127.0.0.1:5000
   ```

---

## 📝 How to Use

1. **Browse Patch Notes:** The homepage automatically loads the latest patch notes. You can toggle dynamic pills (e.g. *Champions*, *ARAM*, *Arena*) or type keywords in the search bar to locate specific updates.
2. **Draft a Post:** Click the **Select** button on any card. The right-hand column will transition from an empty state to the active composer, prepopulating with the full update details.
3. **Handle Character Limits:** If the draft is over X/Twitter's 280-character limit, the counter highlights in red, the "Post" button is disabled, and the **Auto-Fit** button begins to pulse.
4. **Auto-Fit Truncation:** Click **Auto-Fit** to instantly rebuild the draft. It will use the champion's Buff/Nerf emoji status and list only the key numerical highlights, fitting as many as possible within the 280 limit.
5. **Publish to X/Twitter:** Click **Post to X** to open a new tab containing the encoded intent link. This populates your Twitter composer interface without requiring OAuth setups.
