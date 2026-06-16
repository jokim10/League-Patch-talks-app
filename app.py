from flask import Flask, jsonify, render_template, request
import requests
from bs4 import BeautifulSoup
import re
import time
from html.parser import HTMLParser
import urllib.parse

app = Flask(__name__)

# Cache configuration
CACHE_DURATION = 600  # 10 minutes
cache = {
    "data": None,
    "patch_name": "Patch Notes",
    "timestamp": 0
}

class TwitterTextStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []
        
    def handle_starttag(self, tag, attrs):
        if tag in ['p', 'br', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            self.fed.append('\n')
        elif tag == 'li':
            self.fed.append('\n• ')
            
    def handle_endtag(self, tag):
        if tag in ['p', 'blockquote']:
            self.fed.append('\n')
            
    def handle_data(self, d):
        # Clean double spaces
        d_clean = re.sub(r'[ \t]+', ' ', d)
        # Replace the weird question marks or unicode characters League notes use for arrow indicators
        d_clean = d_clean.replace('\u21d2', '->')
        d_clean = d_clean.replace('⇒', '->')
        self.fed.append(d_clean)
        
    def get_data(self):
        text = ''.join(self.fed)
        text = re.sub(r'\n\s*\n', '\n\n', text)
        return text.strip()

def strip_html_for_twitter(html_str):
    if not html_str:
        return ""
    stripper = TwitterTextStripper()
    stripper.feed(html_str)
    return stripper.get_data()

def classify_update(title, text_content):
    text_lower = text_content.lower()
    
    # Heuristics for Buffs / Nerfs
    buff_words = ['buff', 'buffing', 'increase', 'strengthen', 'love', 'help', 'boost', 'reward', 'benefit', 'restore']
    nerf_words = ['nerf', 'nerfing', 'decrease', 'reduce', 'weaken', 'down', 'dominance', 'bullying', 'too powerful', 'pull power', 'temporarily disabled']
    
    buff_score = sum(text_lower.count(w) for w in buff_words)
    nerf_score = sum(text_lower.count(w) for w in nerf_words)
    
    # Scan numerical lines
    for line in text_content.split('\n'):
        if '->' in line:
            is_cooldown_or_mana = any(w in line.lower() for w in ['cooldown', 'mana', 'cost', 'recharge'])
            parts = line.split('->')
            if len(parts) >= 2:
                nums_before = re.findall(r'(\d+(?:\.\d+)?)', parts[0])
                nums_after = re.findall(r'(\d+(?:\.\d+)?)', parts[1])
                if nums_before and nums_after:
                    try:
                        val_before = float(nums_before[-1])
                        val_after = float(nums_after[0])
                        
                        if is_cooldown_or_mana:
                            if val_after < val_before:
                                buff_score += 1.5
                            elif val_after > val_before:
                                nerf_score += 1.5
                        else:
                            if val_after > val_before:
                                buff_score += 1.5
                            elif val_after < val_before:
                                nerf_score += 1.5
                    except ValueError:
                        pass
                        
    if buff_score > nerf_score:
        return "buff", "🟢"
    elif nerf_score > buff_score:
        return "nerf", "🔴"
    else:
        return "change", "🟡"

def extract_numerical_highlights(content_text):
    highlights = []
    current_context = ""
    
    for line in content_text.split('\n'):
        line = line.strip()
        if not line:
            continue
            
        if '->' in line:
            line_clean = re.sub(r'^[•\-\*\s]+', '', line)
            if current_context:
                ctx_short = current_context.split('-')[0].strip()
                if ctx_short.lower() in line_clean.lower():
                    highlights.append(f"• {line_clean}")
                else:
                    highlights.append(f"• {ctx_short}: {line_clean}")
            else:
                highlights.append(f"• {line_clean}")
        else:
            if len(line) < 45 and not line.endswith('.') and not any(w in line.lower() for w in ['we ', 'is ', 'are ', 'was ', 'has ', 'looking to']):
                current_context = line
    return "\n".join(highlights)

def get_heading_level(name):
    if name == 'h2': return 2
    if name == 'h3': return 3
    if name == 'h4': return 4
    return 99

def get_content_for_heading(start_heading):
    content_tags = []
    start_level = get_heading_level(start_heading.name)
    
    curr = start_heading.next_element
    while curr:
        # Stop at same or higher level heading
        if curr.name in ['h2', 'h3', 'h4']:
            curr_level = get_heading_level(curr.name)
            if curr_level <= start_level:
                break
        
        if curr.name:
            # Avoid adding nested children if parent is already added
            is_child = False
            for parent in curr.parents:
                if parent in content_tags or parent == start_heading:
                    is_child = True
                    break
            if not is_child:
                content_tags.append(curr)
        curr = curr.next_element
    return content_tags

def parse_lol_patch_notes():
    url = "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-12-notes/"
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Try to extract the patch name
    patch_name = "Patch Notes"
    h1_title = soup.find('h1', class_='title')
    if h1_title:
        title_text = h1_title.get_text().strip()
        match = re.search(r'Patch\s+([0-9.]+)', title_text, re.IGNORECASE)
        if match:
            patch_name = f"Patch {match.group(1)}"
            
    # Find all headings to structure the document linearly
    headings = soup.find_all(['h2', 'h3', 'h4'])
    
    current_h2 = None
    sections_map = {}
    
    # Phase 1: Group headings chronologically
    for h in headings:
        if h.name == 'h2':
            h_text = h.get_text().strip()
            h_id = h.get('id', '')
            if not h_text or h_id == 'patch-top' or h_text == "Related Articles":
                continue
            current_h2 = h
            sections_map[current_h2] = {
                "title": h_text,
                "id": h_id if h_id else re.sub(r'[^a-z0-9]+', '-', h_text.lower()),
                "h3s": [],
                "h4s": []
            }
        elif current_h2:
            if h.name == 'h3':
                sections_map[current_h2]["h3s"].append(h)
            elif h.name == 'h4':
                # Treat as main heading only if there is no H3 under this H2 yet
                if not sections_map[current_h2]["h3s"]:
                    sections_map[current_h2]["h4s"].append(h)
                    
    parsed_sections = []
    
    # Phase 2: Process contents and create cards
    for h2_tag, info in sections_map.items():
        section_title = info["title"]
        section_id = info["id"]
        updates = []
        
        if info["h3s"]:
            # Case A: We have H3 headings (e.g. Champions, Systems)
            for h3_idx, h3_tag in enumerate(info["h3s"]):
                title = h3_tag.get_text().strip()
                card_id = h3_tag.get('id', '')
                if not card_id:
                    a = h3_tag.find('a')
                    if a and a.get('id'):
                        card_id = a.get('id')
                if not card_id:
                    card_id = f"upd-{section_id}-{h3_idx}"
                    
                content_tags = get_content_for_heading(h3_tag)
                
                # Find first image for card representation
                img_url = ''
                for tag in content_tags:
                    img = tag.find('img') if hasattr(tag, 'find') else None
                    if img:
                        img_url = img.get('src', '')
                        if img_url: break
                
                content_html = "".join([str(tag) for tag in content_tags])
                
                # Extract clean text for Twitter (just description)
                clean_desc = strip_html_for_twitter(content_html)
                
                # Classify Status
                status = "change"
                emoji = "🟡"
                if section_title.lower() in ['champions', 'systems', 'arena', 'aram: mayhem']:
                    status, emoji = classify_update(title, clean_desc)
                
                highlights = extract_numerical_highlights(clean_desc)
                
                updates.append({
                    "id": card_id,
                    "type": section_title,
                    "title": title,
                    "image_url": img_url,
                    "link": f"{url}#{card_id}",
                    "content_html": content_html,
                    "content_text": clean_desc,
                    "status": status,
                    "emoji": emoji,
                    "highlights": highlights
                })
                
        elif info["h4s"]:
            # Case B: We have H4 headings (e.g. ARAM: Mayhem, Arena, Upcoming Skins)
            for h4_idx, h4_tag in enumerate(info["h4s"]):
                title = h4_tag.get_text().strip()
                card_id = h4_tag.get('id', '')
                if not card_id:
                    card_id = f"upd-{section_id}-{h4_idx}"
                    
                content_tags = get_content_for_heading(h4_tag)
                
                img_url = ''
                for tag in content_tags:
                    img = tag.find('img') if hasattr(tag, 'find') else None
                    if img:
                        img_url = img.get('src', '')
                        if img_url: break
                
                content_html = "".join([str(tag) for tag in content_tags])
                clean_desc = strip_html_for_twitter(content_html)
                
                # Classify Status
                status = "change"
                emoji = "🟡"
                if section_title.lower() in ['champions', 'systems', 'arena', 'aram: mayhem']:
                    status, emoji = classify_update(title, clean_desc)
                
                highlights = extract_numerical_highlights(clean_desc)
                
                updates.append({
                    "id": card_id,
                    "type": section_title,
                    "title": title,
                    "image_url": img_url,
                    "link": f"{url}#{card_id}",
                    "content_html": content_html,
                    "content_text": clean_desc,
                    "status": status,
                    "emoji": emoji,
                    "highlights": highlights
                })
                
        else:
            # Case C: Single Card Section (e.g. Bugfixes, Highlights, Queue Availability)
            title = section_title
            card_id = section_id
            
            content_tags = get_content_for_heading(h2_tag)
            
            img_url = ''
            for tag in content_tags:
                img = tag.find('img') if hasattr(tag, 'find') else None
                if img:
                    img_url = img.get('src', '')
                    if img_url: break
            
            content_html = "".join([str(tag) for tag in content_tags])
            clean_desc = strip_html_for_twitter(content_html)
            
            # Classify Status
            status = "change"
            emoji = "🟡"
            highlights = extract_numerical_highlights(clean_desc)
            
            updates.append({
                "id": card_id,
                "type": section_title,
                "title": title,
                "image_url": img_url,
                "link": f"{url}#{card_id}",
                "content_html": content_html,
                "content_text": clean_desc,
                "status": status,
                "emoji": emoji,
                "highlights": highlights
            })
            
        # Map back to date grouping layout so frontend remains compliant
        parsed_sections.append({
            "date": section_title,
            "updated_iso": "",
            "link": url,
            "updates": updates
        })
        
    return parsed_sections, patch_name

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force_refresh = request.args.get('force', 'false').lower() == 'true'
    current_time = time.time()
    
    if force_refresh or not cache["data"] or (current_time - cache["timestamp"] > CACHE_DURATION):
        try:
            data, patch_name = parse_lol_patch_notes()
            cache["data"] = data
            cache["patch_name"] = patch_name
            cache["timestamp"] = current_time
            return jsonify({
                "status": "success",
                "source": "live",
                "patch_name": patch_name,
                "timestamp": current_time,
                "data": data
            })
        except Exception as e:
            if cache["data"]:
                return jsonify({
                    "status": "warning",
                    "message": f"Failed to fetch live data: {str(e)}. Displaying cached data.",
                    "source": "cache",
                    "patch_name": cache["patch_name"],
                    "timestamp": cache["timestamp"],
                    "data": cache["data"]
                })
            else:
                return jsonify({
                    "status": "error",
                    "message": str(e)
                }), 500
    else:
        return jsonify({
            "status": "success",
            "source": "cache",
            "patch_name": cache["patch_name"],
            "timestamp": cache["timestamp"],
            "data": cache["data"]
        })

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
