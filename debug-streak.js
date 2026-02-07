
const calculateStreak = (visitDates) => {
    if (visitDates.length === 0) return 0;
    
    // Sort dates in descending order
    const sortedDates = [...visitDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Today (UTC): ${today}`);
    
    // Check if today is in the list or yesterday
    let streak = 0;
    let currentDate = new Date(today);
    
    console.log(`Initial Date Object: ${currentDate.toISOString()}`);
    console.log(`Local Date: ${currentDate.getDate()}`);
    
    // If today is not visited, start from yesterday
    if (!sortedDates.includes(today)) {
      currentDate.setDate(currentDate.getDate() - 1);
      console.log(`Decremented Date (Local method): ${currentDate.toISOString()}`);
    }
    
    // Count consecutive days
    for (const visitDate of sortedDates) {
      const checkDate = currentDate.toISOString().split('T')[0];
      console.log(`Checking ${visitDate} against ${checkDate}`);
      
      if (visitDate === checkDate) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (visitDate < checkDate) {
        console.log("Break: visitDate < checkDate");
        break;
      }
    }
    
    return streak;
  };

  // Mock Date to simulate timezone if needed, but easier to just see output in current env
  // Test case: visited yesterday, not today.
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  console.log(`Test: Yesterday was ${yesterday}`);
  
  const streak = calculateStreak([yesterday]);
  console.log(`Calculated Streak: ${streak}`);
