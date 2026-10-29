import java.util.*;
import org.json.*;
import pl.dartlens.localplay.*;

/** Uses the actual compiled APK engine/statistics. No Android sources are modified. */
public class ApkStatisticsFixture {
  static JSONObject snapshot(JSONObject doc) {
    List<JSONObject> visits=new ArrayList<>();JSONArray all=doc.getJSONArray("visits");
    for(int i=0;i<all.length();i++)if(all.getJSONObject(i).optBoolean("active",true))visits.add(all.getJSONObject(i));
    return LocalGameEngine.INSTANCE.snapshot(doc,visits);
  }
  static JSONObject meta(int rev){return new JSONObject().put("command_id",UUID.randomUUID().toString()).put("expected_revision",rev);}
  static JSONObject apply(JSONObject doc,String action,JSONObject body){return LocalGameEngine.INSTANCE.apply(doc,action,body);}
  public static void main(String[] args) {
    String kind=args[0],a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString(),id=UUID.randomUUID().toString();
    JSONObject config=X01Rules.INSTANCE.standard(kind.equals("nine")?501:40,1);
    JSONObject doc=LocalGameEngine.INSTANCE.create(id,Arrays.asList(a,b),Arrays.asList("Parity "+kind+" A","Parity "+kind+" B"),config);
    if(kind.equals("nine")){
      int[] values={100,60,60,60,90};
      for(int i=0;i<values.length;i++){
        JSONObject body=meta(i).put("player_id",i%2+1).put("score",values[i]).put("darts_used",3).put("double_confirmed",false).put("recording_level",i%2==0?"extended":"quick");
        if(i%2==0)body.put("checkout_attempts",0);doc=apply(doc,"visit-create",body);
      }
    }else if(kind.equals("admin")){
      doc=apply(doc,"visit-create",meta(0).put("player_id",1).put("score",20).put("darts_used",3).put("double_confirmed",false));
      doc=apply(doc,"game-adjudicate",meta(1).put("kind","interrupted").put("reason","Parity interruption"));
    }else{
      doc=apply(doc,"visit-create",meta(0).put("player_id",1).put("score",40).put("darts_used",1).put("double_confirmed",true).put("recording_level","extended").put("checkout_attempts",1));
    }
    JSONObject row=new JSONObject().put("authority","local").put("document",doc);
    JSONObject local=LocalStatistics.INSTANCE.profile(a,Arrays.asList(row),"","all","all",false);
    JSONArray players=new JSONArray().put(new JSONObject().put("id",a).put("name","Parity "+kind+" A").put("is_guest",false)).put(new JSONObject().put("id",b).put("name","Parity "+kind+" B").put("is_guest",false));
    JSONObject payload=meta(0).put("contract","dart-lens-x01/1").put("origin_id",UUID.randomUUID().toString()).put("local_game_id",id).put("share",true).put("config",config).put("players",players)
      .put("mappings",new JSONArray().put(new JSONObject().put("mode","new")).put(new JSONObject().put("mode","new"))).put("commands",doc.getJSONArray("commands")).put("expected_state",LocalGameEngine.INSTANCE.projection(snapshot(doc)));
    System.out.println(new JSONObject().put("kind",kind).put("local",local).put("payload",payload));
  }
}
