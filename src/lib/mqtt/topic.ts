/**
 * เทียบ topic กับ filter ตามกฎ MQTT wildcard
 *   +  = แทน 1 ระดับ
 *   #  = แทนตั้งแต่ระดับนั้นลงไปทั้งหมด (ต้องอยู่ท้ายสุด)
 */
export function topicMatches(filter: string, topic: string): boolean {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");

  for (let i = 0; i < filterParts.length; i += 1) {
    const part = filterParts[i];

    if (part === "#") {
      // "sensors/#" ครอบคลุม "sensors" เองด้วยตามสเปก
      return true;
    }

    if (i >= topicParts.length) return false;
    if (part === "+") continue;
    if (part !== topicParts[i]) return false;
  }

  return filterParts.length === topicParts.length;
}

export function matchesAny(filters: string[], topic: string): boolean {
  return filters.some((filter) => topicMatches(filter, topic));
}
